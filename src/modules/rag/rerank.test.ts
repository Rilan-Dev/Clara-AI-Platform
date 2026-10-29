import { afterEach, describe, expect, it, vi } from "vitest";
import { rerankCandidates } from "./rerank";

const originals = {
  url: process.env.RAG_RERANK_URL,
  enabled: process.env.RAG_RERANK_ENABLED,
  timeout: process.env.RAG_RERANK_TIMEOUT_MS,
  apiKey: process.env.RAG_RERANK_API_KEY,
  maxCandidates: process.env.RAG_RERANK_MAX_CANDIDATES,
};
const candidates = [
  { id: "a", snippet: "Unrelated high similarity", score: 0.94 },
  { id: "b", snippet: "Correct contract clause", score: 0.73 },
  { id: "c", snippet: "Less useful content", score: 0.68 },
];
const run = (options?: { disabled?: boolean }) =>
  rerankCandidates("contract clause", candidates, (hit) => hit.snippet, options);

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries({
    RAG_RERANK_URL: originals.url,
    RAG_RERANK_ENABLED: originals.enabled,
    RAG_RERANK_TIMEOUT_MS: originals.timeout,
    RAG_RERANK_API_KEY: originals.apiKey,
    RAG_RERANK_MAX_CANDIDATES: originals.maxCandidates,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("optional model-based reranking", () => {
  it("bounds multilingual candidate batches without losing tail evidence", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    process.env.RAG_RERANK_MAX_CANDIDATES = "2";
    const request = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [{ index: 1, score: 0.9 }, { index: 0, score: 0.1 }],
    }));
    vi.stubGlobal("fetch", request);
    const ranked = await run();
    expect(ranked.map((hit) => hit.id)).toEqual(["b", "a", "c"]);
    expect(ranked[2]?.rerankScore).toBeUndefined();
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).texts).toHaveLength(2);
  });

  it("reports only privacy-safe outcomes: applied, skipped and upstream fallback", async () => {
    const observed = vi.fn();
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { index: 0, score: 0.2 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.1 },
      ],
    })));
    await rerankCandidates("contract clause", candidates, (hit) => hit.snippet, { onObservation: observed });
    expect(observed).toHaveBeenLastCalledWith({
      status: "applied", ms: expect.any(Number), candidateCount: 3,
    });
    process.env.RAG_RERANK_ENABLED = "false";
    await rerankCandidates("contract clause", candidates, (hit) => hit.snippet, { onObservation: observed });
    expect(observed).toHaveBeenLastCalledWith({
      status: "skipped", ms: expect.any(Number), candidateCount: 3,
    });
    process.env.RAG_RERANK_ENABLED = "true";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await rerankCandidates("contract clause", candidates, (hit) => hit.snippet, { onObservation: observed });
    expect(observed).toHaveBeenLastCalledWith({
      status: "fallback", ms: expect.any(Number), candidateCount: 3,
    });
    // A faulty diagnostic callback must never make optional reranking fail.
    await expect(rerankCandidates("contract clause", candidates, (hit) => hit.snippet, {
      onObservation: () => { throw new Error("telemetry unavailable"); },
    })).resolves.toEqual(candidates);
  });

  it("distinguishes TEI timeout from other fail-open retrieval outcomes", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    process.env.RAG_RERANK_TIMEOUT_MS = "100";
    const observed = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal instanceof AbortSignal ? init.signal.reason : new Error("aborted")), { once: true });
    })));
    await expect(rerankCandidates("contract clause", candidates, (hit) => hit.snippet, {
      onObservation: observed,
    })).resolves.toEqual(candidates);
    expect(observed).toHaveBeenCalledWith({
      status: "timeout", ms: expect.any(Number), candidateCount: 3,
    });
  });

  it("does not contact a model without an operator-configured endpoint", async () => {
    delete process.env.RAG_RERANK_URL;
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await run()).toEqual(candidates);
    expect(request).not.toHaveBeenCalled();
  });

  it("orders by cross-encoder relevance, preserving Qdrant citation scores", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local:8080/rerank";
    process.env.RAG_RERANK_ENABLED = "true";
    const request = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [
        { index: 1, score: 0.99 },
        { index: 0, score: 0.15 },
        { index: 2, score: 0.12 },
      ],
    }));
    vi.stubGlobal("fetch", request);
    const actual = await run();
    expect(actual.map((hit) => hit.id)).toEqual(["b", "a", "c"]);
    expect(actual[0]?.score).toBe(0.73);
    expect(actual[0]?.rerankScore).toBe(0.99);
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).texts).toEqual(
      candidates.map((hit) => hit.snippet),
    );
  });

  it("skips inference on latency-sensitive voice turns and explicit disable", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await run({ disabled: true })).toEqual(candidates);
    process.env.RAG_RERANK_ENABLED = "false";
    expect(await run()).toEqual(candidates);
    expect(request).not.toHaveBeenCalled();
  });

  it("fails open for malformed, duplicate, missing, and non-finite scores", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    for (const ranks of [
      [{ index: 0, score: 0.5 }],
      [{ index: 0, score: 0.5 }, { index: 0, score: 0.6 }, { index: 2, score: 0.8 }],
      [{ index: 0, score: 0.5 }, { index: 1, score: Infinity }, { index: 2, score: 0.8 }],
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ranks })));
      expect(await run()).toEqual(candidates);
    }
  });

  it("fails open on upstream errors rather than breaking RAG retrieval", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect(await run()).toEqual(candidates);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("unavailable"); }));
    expect(await run()).toEqual(candidates);
  });

  it("rejects HTTP redirects to prevent KB snippets from reaching a second endpoint", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe("error");
      return { ok: false };
    });
    vi.stubGlobal("fetch", request);
    expect(await run()).toEqual(candidates);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("falls back to vector order if snippet extraction throws", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(rerankCandidates("contract clause", candidates, () => {
      throw new Error("invalid retrieved payload");
    })).resolves.toEqual(candidates);
    expect(request).not.toHaveBeenCalled();
  });

  it("bounds long multilingual query and candidate text before sending to TEI", async () => {
    process.env.RAG_RERANK_URL = "http://tei.local/rerank";
    const request = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [{ index: 0, score: 0.7 }, { index: 1, score: 0.8 }],
    }));
    vi.stubGlobal("fetch", request);
    await rerankCandidates("Q".repeat(4_000), [
      { id: "first", score: 0.9, snippet: "A".repeat(6_000) },
      { id: "second", score: 0.8, snippet: "B".repeat(6_000) },
    ], (hit) => hit.snippet);
    const body = JSON.parse(String(request.mock.calls[0]![1]?.body));
    expect(body.query).toHaveLength(2_000);
    expect(body.texts).toHaveLength(2);
    expect(body.texts.every((item: string) => item.length === 2_000)).toBe(true);
  });

  it("never sends a request to an invalid or non-HTTP endpoint", async () => {
    process.env.RAG_RERANK_URL = "file:///etc/passwd";
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await run()).toEqual(candidates);
    expect(request).not.toHaveBeenCalled();
  });
});
