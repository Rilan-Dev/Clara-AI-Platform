import { describe, it, expect, vi, afterEach } from "vitest";
import {
  looksLikeChatModel,
  looksLikeEmbeddingModel,
  looksLikeVoiceModel,
  validateModelField,
  embeddingDimensionFor,
  estimateChatCostUsdMicros,
  estimateEmbeddingCostUsdMicros,
  findChatModel,
  findEmbeddingModel,
  chatModelOptions,
  SARVAM_CHAT_MODELS,
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

// ─── Sarvam V0 foundations (Doc/SARVAM_AI_INTEGRATION_PLAN.md §15 V0) ────────

describe("Sarvam chat catalogue (V0)", () => {
  it("catalogues the five vendor chat models with chat-only providers", () => {
    const ids = ["sarvam-105b", "sarvam-105b-conversations", "gemma4", "deepseekv4-flash", "glm5.3"];
    for (const id of ids) {
      expect(looksLikeChatModel(id), id).toBe(true);
      expect(looksLikeEmbeddingModel(id), id).toBe(false);
      const entry = findChatModel(id);
      expect(entry, id).toBeDefined();
      expect(entry?.provider).toBe("sarvam");
    }
  });

  it("marks exactly the three open-source models as beta", () => {
    const beta = SARVAM_CHAT_MODELS.filter((m) => m.beta).map((m) => m.id);
    expect(beta.sort()).toEqual(["deepseekv4-flash", "gemma4", "glm5.3"]);
    expect(SARVAM_CHAT_MODELS.find((m) => m.id === "sarvam-105b")?.beta).toBeUndefined();
  });

  it("classifies unknown future sarvam releases as chat models by pattern", () => {
    expect(looksLikeChatModel("sarvam-2")).toBe(true);
    expect(looksLikeEmbeddingModel("sarvam-2")).toBe(false);
  });

  it("carries the documented context windows", () => {
    expect(findChatModel("sarvam-105b")?.contextTokens).toBe(128_000);
    expect(findChatModel("sarvam-105b-conversations")?.contextTokens).toBe(32_000);
  });
});

describe("Sarvam provider cross-check (V0)", () => {
  it("rejects a sarvam chat model configured for another provider", () => {
    const result = validateModelField({ field: "chat", model: "sarvam-105b", provider: "openai" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_model_mismatch");
  });

  it("accepts a sarvam chat model on the sarvam provider", () => {
    expect(validateModelField({ field: "chat", model: "sarvam-105b", provider: "sarvam" }).ok).toBe(true);
  });

  it("rejects a sarvam chat model in an embedding field (no embeddings API)", () => {
    const result = validateModelField({ field: "embedding", model: "sarvam-105b" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("chat_model_in_embedding_field");
  });
});

describe("voice-surface model trap (V0)", () => {
  it("rejects Bulbul/Saaras model ids in BOTH brain fields", () => {
    for (const field of ["chat", "embedding"] as const) {
      for (const id of ["bulbul:v3", "bulbul:v2", "saaras:v3", "saaras:v4"]) {
        const result = validateModelField({ field, model: id });
        expect(result.ok, `${field}: ${id}`).toBe(false);
        if (!result.ok) expect(result.code).toBe("voice_model_in_brain_field");
      }
    }
  });

  it("looksLikeVoiceModel accepts the vendor ids and rejects brain ids", () => {
    expect(looksLikeVoiceModel("bulbul:v3")).toBe(true);
    expect(looksLikeVoiceModel("saaras:v4")).toBe(true);
    expect(looksLikeVoiceModel("sarvam-105b")).toBe(false);
    expect(looksLikeVoiceModel("gpt-4o")).toBe(false);
    expect(looksLikeVoiceModel("")).toBe(false);
  });
});

describe("Sarvam dark-launch option gating (V0)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // SARVAM_ENABLED is no longer a catalogue switch (2b5c6d12): the provider
  // registry toggle is the sole platform switch, so the env flag is ignored.
  it("ignores the retired SARVAM_ENABLED env switch when a key is present", () => {
    vi.stubEnv("SARVAM_ENABLED", "false");
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    expect(chatModelOptions().some((m) => m.provider === "sarvam")).toBe(true);
  });

  it("shows only stable sarvam models when enabled without the beta flag", () => {
    vi.stubEnv("SARVAM_ENABLED", "true");
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    vi.stubEnv("SARVAM_BETA_MODELS_ENABLED", "false");
    const ids = chatModelOptions("sarvam").map((m) => m.id);
    expect(ids).toEqual(["sarvam-105b", "sarvam-105b-conversations"]);
  });

  it("shows beta models too when the beta flag is on", () => {
    vi.stubEnv("SARVAM_ENABLED", "true");
    vi.stubEnv("SARVAM_API_KEY", "test-key");
    vi.stubEnv("SARVAM_BETA_MODELS_ENABLED", "true");
    expect(chatModelOptions("sarvam")).toHaveLength(5);
  });

  it("requires the API key before the provider is offered at all", () => {
    vi.stubEnv("SARVAM_ENABLED", "true");
    vi.stubEnv("SARVAM_API_KEY", "");
    expect(chatModelOptions().some((m) => m.provider === "sarvam")).toBe(false);
  });
});

describe("Sarvam cost estimation (V0)", () => {
  it("prices sarvam-105b from the converted INR list (₹29.28/₹73.2 per 1M @ 0.012)", () => {
    // $0.35 / 1M input + $0.88 / 1M output → 1M each = $1.23 = 1_230_000 micros
    expect(estimateChatCostUsdMicros("sarvam-105b", 1_000_000, 1_000_000)).toBe(1_230_000);
  });

  it("prices glm5.3 reasoning output at the premium rate", () => {
    // $1.51 / 1M in + $4.75 / 1M out → 1M each = $6.26
    expect(estimateChatCostUsdMicros("glm5.3", 1_000_000, 1_000_000)).toBe(6_260_000);
  });
});
