import { afterEach, describe, expect, it, vi } from "vitest";
import {
  embeddingsEndpoint,
  formatEmbeddingInput,
  getMultilingualSettings,
  modelFamily,
  scoreThresholdFor,
} from "./multilingual-embeddings";
import { TeiEmbeddingProvider } from "./providers/tei";

describe("multilingual embedding models", () => {
  it("formats E5-instruct queries with the instruction and passages as-is", () => {
    const model = "intfloat/multilingual-e5-large-instruct";
    expect(formatEmbeddingInput("office hours?", "query", model, "Find answers")).toBe("Instruct: Find answers\nQuery: office hours?");
    expect(formatEmbeddingInput("We open at 9.", "document", model)).toBe("We open at 9.");
  });

  it("formats Qwen3 queries with the instruct template and documents as-is", () => {
    expect(formatEmbeddingInput("q", "query", "Qwen/Qwen3-Embedding-0.6B", "Find answers")).toBe("Instruct: Find answers\nQuery: q");
    expect(formatEmbeddingInput("doc text", "document", "Qwen/Qwen3-Embedding-0.6B")).toBe("doc text");
    expect(modelFamily("Qwen/Qwen3-Embedding-0.6B")).toBe("qwen");
    expect(modelFamily("other/qwen3-embedding-4b")).toBe("qwen");
  });

  it("uses query:/passage: prefixes for classic E5 and raw text for BGE-M3", () => {
    expect(formatEmbeddingInput("q", "query", "intfloat/multilingual-e5-large")).toBe("query: q");
    expect(formatEmbeddingInput("p", "document", "intfloat/multilingual-e5-large")).toBe("passage: p");
    expect(formatEmbeddingInput("q", "query", "BAAI/bge-m3")).toBe("q");
    expect(modelFamily("someone/e5-base-v2")).toBe("e5");
  });

  it("defaults to the local Qwen3 model with its 1024-d contract", () => {
    expect(getMultilingualSettings({}).model).toBe("Qwen/Qwen3-Embedding-0.6B");
    const on = getMultilingualSettings({ MULTILINGUAL_EMBEDDINGS_ENABLED: "true", MULTILINGUAL_EMBEDDINGS_BASE_URL: "http://qwen-embeddings:8080" });
    expect(on).toMatchObject({ available: true, dimension: 1024, model: "Qwen/Qwen3-Embedding-0.6B" });
  });

  it("builds the embeddings URL from any base the admin enters", () => {
    expect(embeddingsEndpoint("http://embeddings:80")).toBe("http://embeddings:80/v1/embeddings");
    expect(embeddingsEndpoint("https://api.example.com/v1/openai/")).toBe("https://api.example.com/v1/openai/embeddings");
    expect(embeddingsEndpoint("https://x.example.com/v1")).toBe("https://x.example.com/v1/embeddings");
    expect(embeddingsEndpoint("https://x.example.com/v1/embeddings")).toBe("https://x.example.com/v1/embeddings");
  });

  it("is available only when switched on and configured", () => {
    expect(getMultilingualSettings({}).available).toBe(false);
    const on = getMultilingualSettings({ MULTILINGUAL_EMBEDDINGS_ENABLED: "true", MULTILINGUAL_EMBEDDINGS_BASE_URL: "http://e:80" });
    expect(on).toMatchObject({ available: true, dimension: 1024, model: "Qwen/Qwen3-Embedding-0.6B" });
    const unknown = getMultilingualSettings({
      MULTILINGUAL_EMBEDDINGS_ENABLED: "true", MULTILINGUAL_EMBEDDINGS_BASE_URL: "http://e:80", MULTILINGUAL_EMBEDDINGS_MODEL: "org/new-model",
    });
    expect(unknown.configured).toBe(false); // unknown model needs an explicit dimension
  });

  it("uses a model-appropriate evidence cut-off", () => {
    expect(scoreThresholdFor("openai", "text-embedding-3-small", 0.25, {})).toBe(0.25);
    expect(scoreThresholdFor("tei", "intfloat/multilingual-e5-large-instruct", 0.25, {})).toBe(0.8);
    expect(scoreThresholdFor("tei", "Qwen/Qwen3-Embedding-0.6B", 0.25, {})).toBe(0.35);
    expect(scoreThresholdFor("tei", "BAAI/bge-m3", 0.25, {})).toBe(0.45);
    expect(scoreThresholdFor("tei", "Qwen/Qwen3-Embedding-0.6B", 0.25, { MULTILINGUAL_EMBEDDINGS_SCORE_THRESHOLD: "0.4" })).toBe(0.4);
  });
});

describe("TeiEmbeddingProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("embeds queries with the instruction, orders by index and normalises", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { input: string[] };
      expect(body.input[0]).toMatch(/^Instruct: .*\nQuery: hello$/);
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [3, 4] }], usage: { prompt_tokens: 5 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onUsage = vi.fn();
    const provider = new TeiEmbeddingProvider({
      provider: "tei", embeddingModel: "Qwen/Qwen3-Embedding-0.6B", embeddingDimension: 2,
      baseUrl: "http://qwen-embeddings:8080", apiKey: "secret",
    });
    const vector = await provider.embedText("hello", { onUsage });
    expect(vector).toEqual([0.6, 0.8]);
    expect(onUsage).toHaveBeenCalledWith({ promptTokens: 5, completionTokens: 0 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://qwen-embeddings:8080/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("returns batch vectors in input order and rejects a wrong vector size", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 2] }, { index: 0, embedding: [2, 0] }] }), { status: 200 })));
    const provider = new TeiEmbeddingProvider({ provider: "tei", embeddingModel: "BAAI/bge-m3", embeddingDimension: 2, baseUrl: "http://e" });
    expect(await provider.embedBatch(["a", "b"])).toEqual([[1, 0], [0, 1]]);

    const wrong = new TeiEmbeddingProvider({ provider: "tei", embeddingModel: "BAAI/bge-m3", embeddingDimension: 3, baseUrl: "http://e" });
    await expect(wrong.embedBatch(["a", "b"])).rejects.toThrow(/2-dimensional/);
  });

  it("surfaces HTTP errors with their status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("overloaded", { status: 503 })));
    const provider = new TeiEmbeddingProvider({ provider: "tei", embeddingModel: "BAAI/bge-m3", baseUrl: "http://e" });
    await expect(provider.embedText("x")).rejects.toMatchObject({ status: 503 });
  });
});
