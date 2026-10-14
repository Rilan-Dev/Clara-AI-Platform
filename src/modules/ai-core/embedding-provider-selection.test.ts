import { afterEach, describe, expect, it, vi } from "vitest";
import { selectEmbeddingProvider } from "./embedding-provider-selection";

afterEach(() => vi.unstubAllEnvs());

describe("embedding-only provider selection", () => {
  it("honors an explicit Gemini override when Gemini credentials are present", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "openai", override: " GEMINI ", openaiApiKey: "openai-key", geminiApiKey: "gemini-key" })).toBe("gemini");
  });
  it("does not switch to Gemini for an override without Gemini credentials", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "openai", override: "gemini", openaiApiKey: "openai-key", geminiApiKey: " " })).toBe("openai");
  });
  it("falls back from an unconfigured OpenAI default to configured Gemini", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "openai", openaiApiKey: "", geminiApiKey: "gemini-key" })).toBe("gemini");
  });
  it("keeps OpenAI when neither provider has usable credentials", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "openai", openaiApiKey: " ", geminiApiKey: undefined })).toBe("openai");
  });
  it("preserves a configured Gemini default without requiring the override", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "gemini", openaiApiKey: "openai-key", geminiApiKey: "gemini-key" })).toBe("gemini");
  });
  it("does not change embedding selection for unrelated override values", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "openai", override: "openai", openaiApiKey: "openai-key", geminiApiKey: "gemini-key" })).toBe("openai");
  });
  it("never overrides a non-OpenAI configured provider merely because OpenAI is unconfigured", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "gemini", openaiApiKey: "", geminiApiKey: "" })).toBe("gemini");
  });
});
