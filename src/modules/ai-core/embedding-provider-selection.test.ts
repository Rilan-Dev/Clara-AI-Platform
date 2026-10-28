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
  it("honors an explicit Qwen override when the local server is configured", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "gemini", override: " qwen ", openaiApiKey: "k", geminiApiKey: "k", qwenConfigured: true })).toBe("qwen");
  });
  it("ignores a Qwen override when the local server is not configured", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "gemini", override: "qwen", openaiApiKey: "k", geminiApiKey: "k", qwenConfigured: false })).toBe("gemini");
  });
  it("falls back from an unconfigured OpenAI default to Qwen when it is the only configured backbone", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "qwen", openaiApiKey: "", geminiApiKey: "" })).toBe("qwen");
  });
  it("keeps a configured Qwen platform default without requiring any cloud key", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "qwen", openaiApiKey: "", geminiApiKey: "", qwenConfigured: true })).toBe("qwen");
  });
  it("does not change embedding selection for unrelated override values", () => {
    expect(selectEmbeddingProvider({ configuredProvider: "openai", override: "openai", openaiApiKey: "openai-key", geminiApiKey: "gemini-key" })).toBe("openai");
  });
});
