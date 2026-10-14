import { afterEach, describe, expect, it, vi } from "vitest";

import { embeddingDimensionFor, findEmbeddingModel } from "./model-catalog";

// The GoogleGenAI constructor is never reached by these tests (dimension
// resolution is pure), but the import graph needs the module to exist.
// NOTE: the mock must be CONSTRUCTABLE — `new GoogleGenAI(...)` rejects an
// arrow-function mock with "is not a constructor" (3 tests failed on it).
const ctorSpy = vi.hoisted(() => ({ options: [] as unknown[] }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { embedContent: vi.fn() };
    constructor(options?: unknown) {
      ctorSpy.options.push(options);
    }
  },
}));

import { GeminiProvider } from "./providers/gemini";

describe("gemini-embedding-2-preview catalogue support", () => {
  afterEach(() => {
    delete process.env.GEMINI_EMBEDDING_DIMENSION;
    delete process.env.GEMINI_BASE_URL;
    ctorSpy.options.length = 0;
  });

  it("catalogues the model as a 3072-dim Matryoshka embedding", () => {
    expect(embeddingDimensionFor("gemini-embedding-2-preview")).toBe(3072);
    expect(findEmbeddingModel("gemini-embedding-2-preview")?.matryoshkaMaxDimension).toBe(3072);
    // Case-insensitive lookup, like every other catalogue entry.
    expect(embeddingDimensionFor("GEMINI-EMBEDDING-2-PREVIEW")).toBe(3072);
  });

  it("resolves the output dimension without an env override (the reported defect)", () => {
    // Before the catalogue entry this threw
    // "Unknown output dimension for Gemini embedding model" on EVERY call —
    // selecting the model in Settings → AI Platform → Embeddings broke
    // ingestion and retrieval even with a valid Gemini key.
    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });
    expect(provider.getEmbeddingDimension()).toBe(3072);
  });

  it("honours a requested Matryoshka dimension below the max", () => {
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";
    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });
    expect(provider.getEmbeddingDimension()).toBe(1536);
  });

  it("still rejects a configured dimension for a FIXED-size model", () => {
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";
    const provider = new GeminiProvider({
      provider: "gemini",
      apiKey: "test-key",
      embeddingModel: "text-embedding-004", // fixed 768
    });
    expect(() => provider.getEmbeddingDimension()).toThrow(/does not match the fixed output dimension/);
  });

  it("routes Gemini traffic through GEMINI_BASE_URL when set", () => {
    process.env.GEMINI_BASE_URL = "https://gemini-relay.example.com";
    new GeminiProvider({ provider: "gemini", apiKey: "relay-key", embeddingModel: "gemini-embedding-2-preview" });
    expect(ctorSpy.options.at(-1)).toMatchObject({
      apiKey: "relay-key",
      httpOptions: { baseUrl: "https://gemini-relay.example.com/" },
    });
  });

  it("ignores an invalid GEMINI_BASE_URL instead of breaking every Gemini call", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      process.env.GEMINI_BASE_URL = "not a valid url";
      new GeminiProvider({ provider: "gemini", apiKey: "test-key", embeddingModel: "gemini-embedding-2-preview" });
      expect(ctorSpy.options.at(-1)).toEqual({ apiKey: "test-key" });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
