import type { AIProvider } from "./config-types";

export type EmbeddingProviderSelectionInput = {
  configuredProvider: AIProvider;
  override?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  /** Qwen server endpoint set (QWEN_EMBEDDINGS_BASE_URL or the docker default). */
  qwenConfigured?: boolean;
};

/**
 * Selects the execution provider for embeddings only.
 *
 * An explicit Gemini or Qwen override is honored only when the matching
 * credential/endpoint is present (Qwen needs no key — the local llama.cpp
 * server's base URL being configured is its availability signal). Otherwise
 * the persisted platform default remains authoritative. When OpenAI is the
 * configured default but its credential is absent, Gemini may be used as a
 * temporary availability fallback if configured. This never mutates the
 * persisted default or triggers a Qdrant re-index by itself.
 */
export function selectEmbeddingProvider({
  configuredProvider,
  override,
  openaiApiKey,
  geminiApiKey,
  qwenConfigured = true,
}: EmbeddingProviderSelectionInput): AIProvider {
  const normalizedOverride = override?.trim().toLowerCase();
  const hasOpenAIKey = Boolean(openaiApiKey?.trim());
  const hasGeminiKey = Boolean(geminiApiKey?.trim());

  if (normalizedOverride === "gemini" && hasGeminiKey) return "gemini";
  if (normalizedOverride === "qwen" && qwenConfigured) return "qwen";
  if (configuredProvider === "openai" && !hasOpenAIKey && hasGeminiKey) return "gemini";
  return configuredProvider;
}
