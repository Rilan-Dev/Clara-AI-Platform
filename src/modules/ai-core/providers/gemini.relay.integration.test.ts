/**
 * src/modules/ai-core/providers/gemini.relay.integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL INTEGRATION test of the GEMINI_BASE_URL relay path and the
 * single-request embedBatch contract — no external network, no mocks of the
 * SDK itself.
 *
 * Why this exists: real deployments sit on networks where
 * generativelanguage.googleapis.com is unreachable (connect-timeout —
 * ISP/region/DPI-level blocks; the ingest worker then fails every document
 * with "the embedding provider is unreachable from this server"). The
 * platform's remediation is GEMINI_BASE_URL: point Gemini traffic at an HTTPS
 * relay the deployment CAN reach. These tests prove that path with the REAL
 * @google/genai SDK HTTP stack: a local node:http server plays the relay, and
 * the provider must round-trip embeddings through it with the exact request
 * contract Google expects — the SDK batches every embedContent call into a
 * POST {model}:batchEmbedContents request carrying x-goog-api-key,
 * per-request taskType and outputDimensionality.
 *
 * The embedBatch tests are ALSO the regression proof for the production root
 * cause of "document extractions and embeddings not working": the old
 * implementation fired texts.map(embedContent) under Promise.all — N
 * simultaneous TCP connects to the vendor host. On the deployment's network
 * a single-connection embedding test succeeded in ~900ms while every ingest
 * batch died with ConnectTimeoutError (20s × retries, 20 connections at
 * once). embedBatch must keep the whole batch on ONE HTTP request / ONE
 * connection — asserted here at the socket level, not just the request level.
 *
 * If these tests pass, "deploy a relay + set GEMINI_BASE_URL" is a verified
 * fix — and ingest can no longer self-DOS a burst-sensitive network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { GeminiProvider, resetEmbeddingBatchDiagnosticsForTests } from "./gemini";
import { describeNetworkError } from "@/lib/egress";

/** Captured request + canned Google batchEmbedContents response. */
type RelayCapture = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
};

/** Relay behaviour knobs for the tests below. */
type RelayOptions = {
  /** Distinct vector per request index (order-preservation proof). */
  vectorForIndex?: (index: number) => number[];
  /** Distinct vector per request TEXT (alignment proof for single calls). */
  vectorForText?: (text: string) => number[];
  /** How many embeddings to return for a call carrying N requests. Default:
   * N (the documented Google contract). Set to a constant to reproduce the
   * production quirk ("1 vectors for 20 inputs"). */
  respondWith?: (requestCount: number) => number;
  /** Reject multi-request batches with this status + message (size-cap sim). */
  rejectBatchWith?: { status: number; message: string };
};

type RelayHandle = {
  server: http.Server;
  baseUrl: string;
  captures: RelayCapture[];
  sockets: () => number;
  maxInFlight: () => number;
};

function startRelay(captures: RelayCapture[], opts: RelayOptions = {}): Promise<RelayHandle> {
  let openSockets = 0;
  let inFlight = 0;
  let peakInFlight = 0;
  const vectorForIndex = opts.vectorForIndex ?? (() => [0.042, -0.017, 0.5, 0.25]);

  const server = http.createServer((req, res) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body: Record<string, unknown> = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      captures.push({
        method: req.method ?? "?",
        url: req.url ?? "?",
        headers: req.headers,
        body,
      });

      const requests = (Array.isArray(body.requests) ? body.requests : []) as Array<
        { content?: { parts?: Array<{ text?: string }> } }
      >;
      const requestCount = requests.length;
      const responseCount = opts.respondWith ? opts.respondWith(requestCount) : requestCount;
      if (opts.rejectBatchWith && requestCount > 1) {
        res.writeHead(opts.rejectBatchWith.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: opts.rejectBatchWith.status, message: opts.rejectBatchWith.message } }));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        // Google batchEmbedContents response shape: one embedding per request,
        // same order as the requests — give each a distinct vector. With
        // respondWith() < requestCount this reproduces the production quirk
        // (only the first K requests come back embedded).
        res.end(JSON.stringify({
          embeddings: Array.from({ length: responseCount }, (_, i) => ({
            values: opts.vectorForText
              ? opts.vectorForText(requests[i]?.content?.parts?.[0]?.text ?? "")
              : vectorForIndex(i),
          })),
        }));
      }
      inFlight -= 1;
    });
  });
  server.on("connection", () => { openSockets += 1; });

  return new Promise<RelayHandle>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        captures,
        sockets: () => openSockets,
        maxInFlight: () => peakInFlight,
      });
    });
  });
}

describe("GEMINI_BASE_URL relay integration (real @google/genai SDK)", () => {
  const envKeys = ["GEMINI_BASE_URL", "GEMINI_EMBEDDING_DIMENSION"] as const;
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    resetEmbeddingBatchDiagnosticsForTests();
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
    expect(vector).toEqual([0.042, -0.017, 0.5, 0.25]);
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

  it("embedBatch sends ONE batchEmbedContents request for every text and preserves vector order", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures, {
      // Vector for request i is [i, 1] — asserts the response order matches
      // the input order, not a reshuffle.
      vectorForIndex: (i) => [i, 1],
    });
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    const texts = ["alpha chunk", "beta chunk", "gamma chunk"];
    const vectors = await provider.embedBatch(texts);

    // The production fix: the WHOLE batch rides one HTTP round-trip (was: one
    // round-trip per text under Promise.all — the connection-burst that made
    // ingest fail while single-connection tests succeeded).
    expect(captures).toHaveLength(1);
    const call = captures[0];
    expect(call.url).toContain(":batchEmbedContents");
    expect(call.url).not.toContain("generativelanguage.googleapis.com");

    const requests = call.body.requests as Array<Record<string, unknown>>;
    expect(requests).toHaveLength(texts.length);
    for (let i = 0; i < texts.length; i++) {
      expect(requests[i].taskType).toBe("RETRIEVAL_DOCUMENT");
      expect(requests[i].outputDimensionality).toBe(1536);
      const content = requests[i].content as { parts?: Array<{ text?: string }> };
      expect(content.parts?.[0]?.text).toBe(texts[i]);
    }

    expect(vectors).toEqual(texts.map((_, i) => [i, 1]));
  });

  it("embedBatch of 20 chunks (default EMBED_BATCH_SIZE) opens exactly ONE TCP connection", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl, sockets } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    // A full ingest batch — the exact shape the KB ingest worker sends. The
    // old implementation opened 20 sockets at once against the vendor host;
    // that burst is what production networks dropped (ConnectTimeoutError ×20
    // while a lone embedding test call succeeded in ~900ms).
    const texts = Array.from({ length: 20 }, (_, i) => `chunk text ${i} of the policies document`);
    const vectors = await provider.embedBatch(texts);

    expect(vectors).toHaveLength(20);
    expect(captures).toHaveLength(1);
    expect((captures[0].body.requests as unknown[])).toHaveLength(20);
    // Socket-level regression assertion: ONE connection for the whole batch.
    expect(sockets()).toBe(1);
  });

  it("embedBatch splits SEQUENTIALLY when the batch request exceeds a size cap", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl, maxInFlight } = await startRelay(captures, {
      vectorForIndex: (i) => [i, 1],
      // Simulate an undocumented per-batch cap: any request carrying more
      // than one text is rejected as too large.
      rejectBatchWith: { status: 400, message: "request batch too large: exceeds the per-call limit" },
    });
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    const vectors = await provider.embedBatch(["alpha chunk", "beta chunk"]);

    // First attempt (2 texts) rejected → halved → two single-text calls.
    expect(captures).toHaveLength(3);
    expect(captures[0].body.requests).toHaveLength(2);
    expect(captures[1].body.requests).toHaveLength(1);
    expect(captures[2].body.requests).toHaveLength(1);

    // Order preserved through the split, and every request ran sequentially —
    // the fallback must never reintroduce the parallel fan-out.
    expect(vectors).toEqual([[0, 1], [0, 1]]);
    expect(maxInFlight()).toBe(1);
  });

  it("survives a provider that returns fewer embeddings than requests — degrades to sequential singles (production: '1 vectors for 20 inputs')", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl, maxInFlight } = await startRelay(captures, {
      // The production quirk, reproduced exactly: however many texts are
      // batched, the endpoint answers HTTP 200 with ONE embedding (for the
      // first request). Deterministic, transport healthy, single-text
      // calls fine — only the MULTI-request contract is broken.
      respondWith: (requestCount) => (requestCount > 1 ? 1 : requestCount),
      // Vector derived from the embedded text — proves each sequential
      // single call's result lands on the RIGHT text (alignment, not count).
      vectorForText: (text) => [text.length, 1],
    });
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    // Phase 1 — the whole-batch attempt mismatches (1 embedding for 3
    // requests), is DISCARDED (partial data cannot be aligned), and every
    // text is re-embedded as a single request. Before this fix the exact
    // production signature aborted the document:
    //   "Embedding provider returned 1 vectors for 20 inputs".
    const texts = ["alpha chunk", "beta chunk", "gamma chunk"];
    const vectors = await provider.embedBatch(texts);
    expect(vectors).toEqual(texts.map((t) => [t.length, 1]));

    // 1 doomed batch attempt + 3 single-request re-embeds — and the batch
    // attempt carried all 3 texts (the one-round-trip contract).
    expect(captures).toHaveLength(4);
    expect((captures[0].body.requests as unknown[])).toHaveLength(3);
    for (const single of captures.slice(1)) {
      expect((single.body.requests as unknown[])).toHaveLength(1);
    }

    // Phase 2 — the degradation is REMEMBERED per model: the next
    // multi-text batch skips the broken batch endpoint entirely.
    const more = ["delta chunk", "epsilon chunk"];
    const moreVectors = await provider.embedBatch(more);
    expect(moreVectors).toEqual(more.map((t) => [t.length, 1]));
    expect(captures).toHaveLength(6); // + 2 singles, no new batch attempt
    expect((captures[4].body.requests as unknown[])).toHaveLength(1);
    expect((captures[5].body.requests as unknown[])).toHaveLength(1);

    // Never a parallel fan-out: one request in flight at a time throughout.
    expect(maxInFlight()).toBe(1);
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

describe("net-trace upstream rows — Gemini provider wiring (real SDK + relay)", () => {
  // The provider layer now emits one [net-trace] upstream row per vendor call
  // (see @/lib/net-trace): the server-side egress a browser Network tab can
  // never show. Proven here against the REAL @google/genai HTTP stack through
  // the same local relay — the row must name the endpoint the SDK actually
  // hit (relay-aware URL), its HTTP status, duration, and a compact response
  // summary that makes the production count-mismatch visible in the row.

  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const envKeys = ["GEMINI_BASE_URL", "GEMINI_EMBEDDING_DIMENSION", "NET_TRACE"] as const;
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const key of envKeys) delete process.env[key];
    resetEmbeddingBatchDiagnosticsForTests();
    cleanup = [];
  });

  afterEach(() => {
    for (const fn of cleanup) fn();
    for (const key of envKeys) delete process.env[key];
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function outputOf(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  it("verbose: one upstream row per successful batch call, relay URL + res summary", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";
    process.env.NET_TRACE = "verbose";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    await provider.embedBatch(["alpha chunk", "beta chunk", "gamma chunk"]);

    const output = outputOf(logSpy);
    // Exactly one vendor row for the one-round-trip batch contract.
    expect(output.match(/\[net-trace\] upstream gemini/g)).toHaveLength(1);
    // The row names the endpoint the SDK actually hit — the RELAY, not Google.
    expect(output).toContain(`${baseUrl}/v1beta/models/gemini-embedding-2-preview:batchEmbedContents`);
    expect(output).toContain("→ 200");
    expect(output).toContain("· "); // duration present
    // Compact response summary — the Network-tab-style response preview.
    expect(output).toContain('"embeddings":3');
    expect(output).toContain('"requests":3');
    // Request preview (verbose) shows the batched texts, redacted/truncated.
    expect(output).toContain("req  ▸");
  });

  it("NET_TRACE=on: successful vendor calls stay silent (rows are verbose-only)", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";
    process.env.NET_TRACE = "on";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    await provider.embedBatch(["alpha chunk", "beta chunk"]);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("failures are ALWAYS captured with the HTTP status — even at NET_TRACE=off (429)", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures, {
      rejectBatchWith: { status: 429, message: "Resource has been exhausted (Quota exceeded)" },
    });
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";
    process.env.NET_TRACE = "off";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    // The vendor call fails and the error still propagates to the retry ladder.
    await expect(provider.embedBatch(["alpha chunk", "beta chunk"]))
      .rejects.toThrow(/exhausted|429|fetch failed|failed/i);

    const output = outputOf(errorSpy);
    const rows = output.split("\n").filter((l) => l.includes("[net-trace] upstream gemini"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Status extracted from the SDK's ApiError — like the red Network-tab column.
    expect(rows.some((r) => r.includes("→ 429"))).toBe(true);
    expect(output).toContain("cause ▸");
    expect(output).toContain("Resource has been exhausted");
    // The row names the relay endpoint the SDK actually hit.
    expect(rows.some((r) => r.includes(`${baseUrl}/v1beta/models/gemini-embedding-2-preview:batchEmbedContents`))).toBe(true);
  });

  it("the production count-mismatch is visible right in the verbose row (embeddings 1 / requests 3)", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl } = await startRelay(captures, {
      respondWith: (requestCount) => (requestCount > 1 ? 1 : requestCount),
      vectorForText: (text) => [text.length, 1],
    });
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";
    process.env.NET_TRACE = "verbose";

    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "relay-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    const texts = ["alpha chunk", "beta chunk", "gamma chunk"];
    await provider.embedBatch(texts);

    const output = outputOf(logSpy);
    // The DOOMED batch attempt shows HTTP 200 with the broken contract in the
    // response summary — exactly what the Network tab would show (a green
    // request whose body is wrong): 1 embedding for 3 requests.
    expect(output).toContain('"embeddings":1,"requests":3');
    // Every sequential single re-embed gets its own vendor row.
    expect(output.match(/\[net-trace\] upstream gemini/g)).toHaveLength(4); // 1 batch + 3 singles
    // The always-on semantic failure (degradation notice) still fires.
    const errOutput = outputOf(errorSpy);
    expect(errOutput).toContain("degrading to sequential");
  });
});
