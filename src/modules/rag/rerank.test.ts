import { afterEach, describe, expect, it, vi } from "vitest";
import { rerankCandidates } from "./rerank";

const originals = {
  url: process.env.RAG_RERANK_URL,
  enabled: process.env.RAG_RERANK_ENABLED,
  timeout: process.env.RAG_RERANK_TIMEOUT_MS,
  apiKey: process.env.RAG_RERANK_API_KEY,
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
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("optional model-based reranking", () => {
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

  it("never sends a request to an invalid or non-HTTP endpoint", async () => {
    process.env.RAG_RERANK_URL = "file:///etc/passwd";
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await run()).toEqual(candidates);
    expect(request).not.toHaveBeenCalled();
  });
});
