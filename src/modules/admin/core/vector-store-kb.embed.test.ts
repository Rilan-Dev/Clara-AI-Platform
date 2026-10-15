/**
 * src/modules/admin/core/vector-store-kb.embed.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL end-to-end test of the KB ingest embedding path that was failing in
 * production ("document extractions and embeddings not working").
 *
 * It exercises the REAL code chain — vector-store-kb.embedBatches →
 * embedBatchWithRetry → ProviderFactory → GeminiProvider → @google/genai SDK
 * HTTP stack — against a local node:http relay standing in for the Gemini
 * endpoint. Only the usage-event DB write is mocked.
 *
 * Production root cause being regression-tested: embedBatches used to fan out
 * EMBED_BATCH_SIZE (20) simultaneous TCP connections per batch, which the
 * deployment's network dropped (ConnectTimeoutError ×20 while a lone
 * single-connection embedding test succeeded in ~900ms). The contract now:
 *   • one HTTP request per EMBED_BATCH_SIZE slice — 45 chunks = 3 requests
 *   • ONE TCP connection for the whole multi-batch document (keep-alive)
 *   • vectors returned in input order across batch boundaries
 *   • one EMBEDDING usage event per batch (WS-1.1 metering spine)
 *   • an unreachable endpoint still fails fast with the actionable
 *     provider/host error (bounded unreachable-retry budget)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logUsageEvent: vi.fn(async () => undefined),
}));

import { embedBatches } from "./vector-store-kb";
import { logUsageEvent } from "@/modules/knowledge-bases/core/analytics-db";

type RelayCapture = { url: string; body: Record<string, unknown> };

function startRelay(captures: RelayCapture[]): Promise<{
  server: http.Server;
  baseUrl: string;
  sockets: () => number;
}> {
  let openSockets = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body: Record<string, unknown> = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      captures.push({ url: req.url ?? "?", body });
      const requestCount = Array.isArray(body.requests) ? body.requests.length : 0;
      res.writeHead(200, { "content-type": "application/json" });
      // One embedding per request, vector [index, 1] — proves cross-batch
      // order preservation end to end.
      res.end(
        JSON.stringify({
          embeddings: Array.from({ length: requestCount }, (_, i) => ({ values: [i, 1] })),
        }),
      );
    });
  });
  server.on("connection", () => { openSockets += 1; });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, sockets: () => openSockets });
    });
  });
}

const PROVIDER_CONFIG = {
  provider: "gemini",
  apiKey: "embed-batches-test-key",
  embeddingModel: "gemini-embedding-2-preview",
} as const;

describe("embedBatches — the KB ingest embedding path (real provider + local relay)", () => {
  const envKeys = ["GEMINI_BASE_URL", "GEMINI_EMBEDDING_DIMENSION"] as const;
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    cleanup = [];
    vi.mocked(logUsageEvent).mockClear();
  });

  afterEach(() => {
    for (const fn of cleanup) fn();
    for (const key of envKeys) delete process.env[key];
  });

  it("embeds 45 chunks in 3 single-request batches over ONE connection, order intact, one usage event per batch", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl, sockets } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    // 45 chunks → EMBED_BATCH_SIZE=20 → 3 batches (20 + 20 + 5).
    const texts = Array.from({ length: 45 }, (_, i) => `policies chunk ${i}`);

    const vectors = await embedBatches([...texts], { ...PROVIDER_CONFIG });

    // Vector order is preserved across batch boundaries.
    expect(vectors).toHaveLength(45);
    expect(vectors[0]).toEqual([0, 1]);
    expect(vectors[19]).toEqual([19, 1]);
    expect(vectors[20]).toEqual([0, 1]); // second batch restarts per-request index
    expect(vectors[44]).toEqual([4, 1]);

    // THREE HTTP round-trips total — one per batch slice, never one per text.
    expect(captures).toHaveLength(3);
    expect(captures.map((c) => (c.body.requests as unknown[]).length)).toEqual([20, 20, 5]);
    for (const capture of captures) {
      expect(capture.url).toContain(":batchEmbedContents");
    }

    // THE production fix, at the socket level: the whole document shares ONE
    // TCP connection (previously: 20 simultaneous connects per batch).
    expect(sockets()).toBe(1);

    // WS-1.1: one EMBEDDING usage event per batch, tokens estimated from chars.
    expect(logUsageEvent).toHaveBeenCalledTimes(3);
    const first = vi.mocked(logUsageEvent).mock.calls[0]?.[0];
    expect(first?.kind).toBe("EMBEDDING");
    expect(first?.provider).toBe("gemini");
    expect(first?.model).toBe("gemini-embedding-2-preview");
    const firstBatchChars = texts.slice(0, 20).reduce((sum, t) => sum + t.length, 0);
    expect(first?.promptTokens).toBe(Math.ceil(firstBatchChars / 4));
  });

  it("fails fast with the actionable provider/host error when the endpoint is unreachable", async () => {
    // Bind then close → a port that refuses connections.
    const { server } = await startRelay([]);
    const deadPort = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    process.env.GEMINI_BASE_URL = `http://127.0.0.1:${deadPort}`;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    let thrown: unknown;
    try {
      // Distinct apiKey → distinct ProviderFactory cache entry → this test
      // constructs a fresh provider against ITS dead port (the factory cache
      // key does not include GEMINI_BASE_URL; env changes are per-process).
      await embedBatches(["chunk one", "chunk two"], {
        ...PROVIDER_CONFIG,
        apiKey: "embed-batches-test-key-dead-relay",
      });
    } catch (err) {
      thrown = err;
    }

    // The error names the provider, the RELAY host actually configured, and
    // the remediation path — the contract the KB UI's "Why did this fail?"
    // detail relies on.
    const message = (thrown as Error)?.message ?? "";
    expect(message).toContain("Embedding failed (gemini/gemini-embedding-2-preview @ 127.0.0.1:");
    expect(message).toContain("embedding provider is unreachable");
    expect(message).toContain("GEMINI_BASE_URL");
    // No usage events when nothing was embedded.
    expect(logUsageEvent).not.toHaveBeenCalled();
  });
});
