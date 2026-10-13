import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(_options: { apiKey: string }) {}
  },
}));

import type { ProviderConfig } from "../types";
import { GeminiProvider } from "./gemini";

function provider(config: Partial<ProviderConfig> = {}) {
  return new GeminiProvider({
    provider: "gemini",
    apiKey: "test-key",
    embeddingModel: "text-embedding-004",
    ...config,
  } as ProviderConfig);
}

describe("Gemini embedding dimension safety", () => {
  beforeEach(() => {
    delete process.env.GEMINI_EMBEDDING_DIMENSION;
  });

  afterEach(() => {
    delete process.env.GEMINI_EMBEDDING_DIMENSION;
  });

  it("uses known fixed dimensions when no override is configured", () => {
    expect(provider().getEmbeddingDimension()).toBe(768);
  });

  it("does not treat GEMINI_CHAT_MODEL env values as an availability source", () => {
    process.env.GEMINI_CHAT_MODEL = "gemini-2.5-flash";
    try {
      expect(() => provider({ chatModel: undefined }).getModelName("chat"))
        .toThrow(/No Gemini chat model is configured/);
    } finally {
      delete process.env.GEMINI_CHAT_MODEL;
    }
  });

  it("does not treat GEMINI_EMBEDDING_MODEL env values as an availability source", () => {
    process.env.GEMINI_EMBEDDING_MODEL = "text-embedding-004";
    try {
      expect(() => provider({ embeddingModel: undefined }).getModelName("embedding"))
        .toThrow(/No Gemini embedding model is configured/);
    } finally {
      delete process.env.GEMINI_EMBEDDING_MODEL;
    }
  });


  it("rejects a configured dimension that conflicts with a fixed-size model", () => {
    expect(() => provider({ embeddingDimension: 1536 }).getEmbeddingDimension())
      .toThrow(/does not match the fixed output dimension 768/);
  });

  it("allows a compatible Matryoshka dimension for gemini-embedding-001", () => {
    expect(provider({
      embeddingModel: "gemini-embedding-001",
      embeddingDimension: 1536,
    }).getEmbeddingDimension()).toBe(1536);
  });

  it("fails closed for an unknown embedding model without an explicit dimension", () => {
    expect(() => provider({ embeddingModel: "gemini-embedding-future" }).getEmbeddingDimension())
      .toThrow(/Unknown output dimension/);
  });

  it("accepts an explicit valid dimension for a newly discovered model", () => {
    expect(provider({
      embeddingModel: "gemini-embedding-future",
      embeddingDimension: 1024,
    }).getEmbeddingDimension()).toBe(1024);
  });

  it("rejects invalid explicit dimensions", () => {
    expect(() => provider({
      embeddingModel: "gemini-embedding-001",
      embeddingDimension: 4096,
    }).getEmbeddingDimension()).toThrow(/positive integer no greater than 3072/);
  });
});
