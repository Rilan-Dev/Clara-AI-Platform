/**
 * src/modules/ai-core/providers/gemini.relay.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL INTEGRATION test of the GEMINI_BASE_URL relay path — no external
 * network, no mocks of the SDK itself.
 *
 * Why this exists: real deployments sit on networks where
 * generativelanguage.googleapis.com is unreachable (connect-timeout —
 * ISP/region/DPI-level blocks; the ingest worker then fails every document
 * with "the embedding provider is unreachable from this server"). The
 * platform's remediation is GEMINI_BASE_URL: point Gemini traffic at an HTTPS
 * relay the deployment CAN reach. This test proves that path with the REAL
 * @google/genai SDK HTTP stack (v1.43): a local node:http server plays the
 * relay, and the provider must round-trip embeddings through it with the
 * exact request contract Google expects — the SDK batches every embedContent
 * call into a POST {model}:batchEmbedContents request carrying
 * x-goog-api-key, per-request taskType and outputDimensionality.
 *
 * If this test passes, "deploy a relay + set GEMINI_BASE_URL" is a verified
 * fix — the only remaining variable on a blocked network is the relay itself.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { GeminiProvider } from "./gemini";
import { describeNetworkError } from "@/lib/egress";

/** Captured request + canned Google batchEmbedContents response. */
type RelayCapture = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
};

const VECTOR = [0.042, -0.017, 0.5, 0.25];

function startRelay(captures: RelayCapture[], vector: number[] = VECTOR) {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      captures.push({
        method: req.method ?? "?",
        url: req.url ?? "?",
        headers: req.headers,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      });
      res.writeHead(200, { "content-type": "application/json" });
      // Google batchEmbedContents response shape (one embedding per request).
      res.end(JSON.stringify({ embeddings: [{ values: vector }] }));
    });
  });
  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe("GEMINI_BASE_URL relay integration (real @google/genai SDK)", () => {
  const envKeys = ["GEMINI_BASE_URL", "GEMINI_EMBEDDING_DIMENSION"] as const;
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    cleanup = [];
  });

  afterEach(() => {
    for (const fn of cleanup) fn();
    for (const key of envKeys) delete process.env[key];
  });

  it("round-trips embedText through a relay with Google's request contract", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    const vector = await provider.embedText("policies document chunk");
    expect(vector).toEqual(VECTOR);
    expect(captures).toHaveLength(1);

    // The request contract a relay must forward to Google verbatim. The SDK
    // batches each embedContent into :batchEmbedContents on the model path.
    const call = captures[0];
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/v1beta/models/gemini-embedding-2-preview:batchEmbedContents");
    expect(call.headers["x-goog-api-key"]).toBe("relay-test-key");
    const requests = call.body.requests as Array<Record<string, unknown>>;
    expect(requests).toHaveLength(1);
    expect(requests[0].taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(requests[0].outputDimensionality).toBe(1536);
    const content = requests[0].content as { parts?: Array<{ text?: string }> };
    expect(content.parts?.[0]?.text).toBe("policies document chunk");
  });

  it("embedBatch fans out to the relay and preserves vector order", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    const vectors = await provider.embedBatch(["alpha chunk", "beta chunk"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toEqual(VECTOR);
    expect(vectors[1]).toEqual(VECTOR);
    // One HTTP round-trip per embedContent call (each a 1-request batch).
    expect(captures).toHaveLength(2);
    for (const call of captures) {
      expect(call.url).toContain(":batchEmbedContents");
      expect(call.url).not.toContain("generativelanguage.googleapis.com");
    }
  });

  it("a dead relay fails fast and the error names the RELAY host, not Google", async () => {
    // Bind then immediately close → a port that refuses connections.
    const { server } = await startRelay([]);
    const deadPort = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    process.env.GEMINI_BASE_URL = `http://127.0.0.1:${deadPort}`;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    let thrown: unknown;
    try {
      await provider.embedText("probe");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);

    // The egress layer must classify the transport failure and attribute it
    // to the configured relay host so operators debug the RIGHT endpoint
    // (previously "connect ECONNREFUSED 127.0.0.1:PORT" carried no host).
    const network = thrown ? describeNetworkError(thrown) : null;
    expect(network).not.toBeNull();
    expect(network?.host).toContain("127.0.0.1");
    expect(network?.host).not.toContain("generativelanguage");
  });
});
