import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QwenEmbeddingProvider,
  QWEN_DEFAULT_BASE_URL,
  QWEN_DEFAULT_MODEL,
  qwenEmbeddingsBaseUrl,
  qwenModelsEndpoint,
} from "./qwen";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  delete process.env.QWEN_EMBEDDINGS_BASE_URL;
  delete process.env.QWEN_EMBEDDING_MODEL;
  delete process.env.QWEN_EMBEDDING_DIMENSION;
  delete process.env.QWEN_API_KEY;
  delete process.env.QWEN_EMBEDDINGS_TIMEOUT_MS;
  delete process.env.QWEN_EMBEDDINGS_QUERY_TASK;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function okResponse(data: unknown, usage?: unknown) {
  return new Response(JSON.stringify({ data, usage }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("endpoint normalisation", () => {
  it("defaults to the in-network docker service", () => {
    expect(qwenEmbeddingsBaseUrl()).toBe(`${QWEN_DEFAULT_BASE_URL}/v1/embeddings`);
    expect(qwenModelsEndpoint()).toBe(`${QWEN_DEFAULT_BASE_URL}/v1/models`);
  });
  it("accepts a bare host", () => {
    expect(qwenEmbeddingsBaseUrl({ QWEN_EMBEDDINGS_BASE_URL: "http://h:9000" })).toBe("http://h:9000/v1/embeddings");
    expect(qwenModelsEndpoint({ QWEN_EMBEDDINGS_BASE_URL: "http://h:9000" })).toBe("http://h:9000/v1/models");
  });
  it("accepts an OpenAI-style …/v1 base", () => {
    expect(qwenEmbeddingsBaseUrl({ QWEN_EMBEDDINGS_BASE_URL: "http://h:9000/v1" })).toBe("http://h:9000/v1/embeddings");
    expect(qwenModelsEndpoint({ QWEN_EMBEDDINGS_BASE_URL: "http://h:9000/v1" })).toBe("http://h:9000/v1/models");
  });
  it("accepts a full …/v1/embeddings URL", () => {
    expect(qwenEmbeddingsBaseUrl({ QWEN_EMBEDDINGS_BASE_URL: "http://h:9000/v1/embeddings" })).toBe("http://h:9000/v1/embeddings");
    expect(qwenModelsEndpoint({ QWEN_EMBEDDINGS_BASE_URL: "http://h:9000/v1/embeddings" })).toBe("http://h:9000/v1/models");
  });
});

describe("QwenEmbeddingProvider", () => {
  it("embeds a query with the Qwen3 instruct format and L2-normalises the vector", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [3, 4] }], { prompt_tokens: 5 }));
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 2 });
    const vector = await provider.embedText("what is Clara?");
    expect(vector).toEqual([0.6, 0.8]); // [3,4]/5

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/embeddings");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(QWEN_DEFAULT_MODEL);
    expect(body.input[0]).toMatch(/^Instruct: .+\nQuery: what is Clara\?$/);
    expect(init.headers.Authorization).toBeUndefined();
    expect(body.encoding_format).toBe("float");
  });

  it("embeds documents as raw text (no instruct prefix)", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([
        { index: 0, embedding: [1, 0] },
        { index: 1, embedding: [0, 2] },
      ]),
    );
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 2 });
    const vectors = await provider.embedBatch(["doc one", "doc two"]);
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.input).toEqual(["doc one", "doc two"]);
  });

  it("sorts out-of-order rows by index before returning", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([
        { index: 1, embedding: [0, 2] },
        { index: 0, embedding: [1, 0] },
      ]),
    );
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 2 });
    const vectors = await provider.embedBatch(["a", "b"]);
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("sends a bearer token when QWEN_API_KEY is configured", async () => {
    process.env.QWEN_API_KEY = "local-token";
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [1] }]));
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 1 });
    await provider.embedText("ping");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer local-token");
  });

  it("rejects a dimension mismatch with the platform expectation", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [0.1, 0.2, 0.3] }]));
    const provider = new QwenEmbeddingProvider({ provider: "qwen" }); // expects 1024
    await expect(provider.embedText("ping")).rejects.toThrow(/3-dimensional vectors/);
  });

  it("rejects a short-count response (batch contract break)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [1] }]));
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 1 });
    await expect(provider.embedBatch(["a", "b"])).rejects.toThrow(/1 vectors for 2 inputs/);
  });

  it("wraps transport failures with the service-location hint", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const provider = new QwenEmbeddingProvider({ provider: "qwen" });
    await expect(provider.embedText("ping")).rejects.toThrow(/qwen-embeddings service is running/);
  });

  it("surfaces HTTP failures with the status and body excerpt", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 400 }),
    );
    const provider = new QwenEmbeddingProvider({ provider: "qwen" });
    await expect(provider.embedText("ping")).rejects.toThrow(/HTTP 400.*model not found/);
  });

  it("rejects a malformed JSON payload", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const provider = new QwenEmbeddingProvider({ provider: "qwen" });
    await expect(provider.embedText("ping")).rejects.toThrow(/malformed response/);
  });

  it("reports usage tokens through the onUsage callback", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [1] }], { prompt_tokens: 42 }));
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 1 });
    const onUsage = vi.fn();
    await provider.embedText("ping", { onUsage });
    expect(onUsage).toHaveBeenCalledWith({ promptTokens: 42, completionTokens: 0 });
  });

  it("honours QWEN_EMBEDDINGS_BASE_URL and QWEN_EMBEDDING_MODEL overrides", async () => {
    process.env.QWEN_EMBEDDINGS_BASE_URL = "http://elsewhere:7000/v1";
    process.env.QWEN_EMBEDDING_MODEL = "custom/model";
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [1] }]));
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 1 });
    await provider.embedText("ping");
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://elsewhere:7000/v1/embeddings");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).model).toBe("custom/model");
  });

  it("uses the QWEN_EMBEDDINGS_QUERY_TASK instruction when set", async () => {
    process.env.QWEN_EMBEDDINGS_QUERY_TASK = "Retrieve matching invoices";
    fetchMock.mockResolvedValueOnce(okResponse([{ index: 0, embedding: [1] }]));
    const provider = new QwenEmbeddingProvider({ provider: "qwen", embeddingDimension: 1 });
    await provider.embedText("Q1 total");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.input[0]).toBe("Instruct: Retrieve matching invoices\nQuery: Q1 total");
  });

  it("serves embedding-only: chatStream throws, getModelName reflects the split", async () => {
    const provider = new QwenEmbeddingProvider({ provider: "qwen" });
    await expect(async () => {
      for await (const _ of provider.chatStream([{ role: "user", content: "hi" }])) void _;
    }).rejects.toThrow(/embeddings only/);
    expect(provider.getProviderName()).toBe("qwen");
    expect(provider.getModelName("embedding")).toBe(QWEN_DEFAULT_MODEL);
    expect(provider.getModelName("chat")).toBe("");
    expect(provider.getEmbeddingDimension()).toBe(1024);
  });

  it("returns an empty batch for an empty embedBatch call (no HTTP round trip)", async () => {
    const provider = new QwenEmbeddingProvider({ provider: "qwen" });
    expect(await provider.embedBatch([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
