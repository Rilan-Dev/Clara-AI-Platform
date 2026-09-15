import { describe, it, expect } from "vitest";
import {
  looksLikeChatModel,
  looksLikeEmbeddingModel,
  validateModelField,
  embeddingDimensionFor,
  estimateChatCostUsdMicros,
  estimateEmbeddingCostUsdMicros,
  findChatModel,
  findEmbeddingModel,
} from "./model-catalog";

describe("model catalogue classification", () => {
  it("recognises known chat models", () => {
    for (const id of ["gpt-4o", "gpt-4o-2024-08-06", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-4o-mini", "gemini-2.5-flash"]) {
      expect(looksLikeChatModel(id), id).toBe(true);
    }
  });

  it("recognises known embedding models", () => {
    for (const id of ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002", "gemini-embedding-001", "text-embedding-004"]) {
      expect(looksLikeEmbeddingModel(id), id).toBe(true);
    }
  });

  it("classifies unknown future models by pattern", () => {
    expect(looksLikeChatModel("gpt-5.7-nova")).toBe(true);      // future chat model
    expect(looksLikeChatModel("gpt-6")).toBe(true);
    expect(looksLikeEmbeddingModel("text-embedding-4-small")).toBe(true); // future embedding model
  });

  it("never classifies a chat model as an embedding model and vice versa", () => {
    expect(looksLikeEmbeddingModel("gpt-4o")).toBe(false);
    expect(looksLikeEmbeddingModel("gpt-4o-2024-08-06")).toBe(false);
    expect(looksLikeChatModel("text-embedding-3-small")).toBe(false);
    expect(looksLikeChatModel("gemini-embedding-001")).toBe(false);
  });

  it("treats blank input as neither", () => {
    expect(looksLikeChatModel("")).toBe(false);
    expect(looksLikeEmbeddingModel("  ")).toBe(false);
  });
});

describe("validateModelField (WS-0.4)", () => {
  it("rejects the reported defect: chat model as embedding model", () => {
    const result = validateModelField({ field: "embedding", model: "gpt-4o-2024-08-06" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("chat_model_in_embedding_field");
      expect(result.message).toContain("chat model");
      expect(result.message).toContain("re-embed"); // remediation copy mentions re-indexing
    }
  });

  it("accepts valid embedding models", () => {
    expect(validateModelField({ field: "embedding", model: "text-embedding-3-small" }).ok).toBe(true);
    expect(validateModelField({ field: "embedding", model: "text-embedding-3-large", provider: "openai" }).ok).toBe(true);
  });

  it("rejects the inverse trap: embedding model as chat model", () => {
    const result = validateModelField({ field: "chat", model: "text-embedding-3-small" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("embedding_model_in_chat_field");
  });

  it("rejects cross-provider mismatches", () => {
    const result = validateModelField({ field: "embedding", model: "text-embedding-004", provider: "openai" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_model_mismatch");
  });

  it("allows blank (inherit) and unknown forward-compatible ids", () => {
    expect(validateModelField({ field: "embedding", model: null }).ok).toBe(true);
    expect(validateModelField({ field: "embedding", model: "" }).ok).toBe(true);
    // A brand-new embedding model not yet in the catalogue must not brick saves.
    expect(validateModelField({ field: "embedding", model: "text-embedding-4-nano" }).ok).toBe(true);
  });
});

describe("dimension metadata", () => {
  it("returns canonical dimensions", () => {
    expect(embeddingDimensionFor("text-embedding-3-small")).toBe(1536);
    expect(embeddingDimensionFor("text-embedding-3-large")).toBe(3072);
    expect(embeddingDimensionFor("text-embedding-ada-002")).toBe(1536);
    expect(embeddingDimensionFor("gemini-embedding-001")).toBe(3072);
    expect(embeddingDimensionFor("text-embedding-004")).toBe(768);
  });

  it("returns null for unknown models", () => {
    expect(embeddingDimensionFor("gpt-4o")).toBeNull();
    expect(embeddingDimensionFor("totally-unknown")).toBeNull();
  });
});

describe("cost estimation (WS-1.1)", () => {
  it("estimates chat cost from the price list in micro-dollars", () => {
    // gpt-4o: $2.50 / 1M input, $10 / 1M output
    // 1M input + 1M output = $12.50 = 12_500_000 micro-dollars
    expect(estimateChatCostUsdMicros("gpt-4o", 1_000_000, 1_000_000)).toBe(12_500_000);
    // 1k input + 1k output on gpt-4o-mini: $0.15/$0.60 per M → 0.00075 USD
    expect(estimateChatCostUsdMicros("gpt-4o-mini", 1_000, 1_000)).toBe(750);
  });

  it("estimates embedding cost", () => {
    // text-embedding-3-small: $0.02 / 1M → 100k tokens = $0.002 = 2000 micros
    expect(estimateEmbeddingCostUsdMicros("text-embedding-3-small", 100_000)).toBe(2000);
  });

  it("returns zero cost for unknown models (honest, never blocks)", () => {
    expect(estimateChatCostUsdMicros("some-future-model", 5_000_000, 5_000_000)).toBe(0);
    expect(estimateEmbeddingCostUsdMicros("some-future-model", 5_000_000)).toBe(0);
  });
});

describe("catalogue integrity", () => {
  it("has no id listed in both catalogues", () => {
    const chatIds = new Set(
      ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-4o", "gpt-4o-mini", "gemini-2.5-flash"].map((s) => s.toLowerCase()),
    );
    for (const id of chatIds) {
      expect(findEmbeddingModel(id), id).toBeUndefined();
    }
    expect(findChatModel("text-embedding-3-small")).toBeUndefined();
    expect(findEmbeddingModel("text-embedding-3-small")).toBeDefined();
  });
});
