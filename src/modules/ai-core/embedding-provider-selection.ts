import type { AIProvider } from "./config-types";

export type EmbeddingProviderSelectionInput = {
  configuredProvider: AIProvider;
  override?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
};

/**
 * Selects the execution provider for embeddings only.
 *
 * An explicit Gemini override is honored only when a Gemini credential is
 * present. Otherwise the persisted platform default remains authoritative.
 * When OpenAI is the configured default but its credential is absent, Gemini
 * may be used as a temporary availability fallback if configured. This never
 * mutates the persisted default or triggers a Qdrant re-index by itself.
 */
export function selectEmbeddingProvider({
  configuredProvider,
  override,
  openaiApiKey,
  geminiApiKey,
}: EmbeddingProviderSelectionInput): AIProvider {
  const normalizedOverride = override?.trim().toLowerCase();
  const hasOpenAIKey = Boolean(openaiApiKey?.trim());
  const hasGeminiKey = Boolean(geminiApiKey?.trim());

  if (normalizedOverride === "gemini" && hasGeminiKey) return "gemini";
  if (configuredProvider === "openai" && !hasOpenAIKey && hasGeminiKey) return "gemini";
  return configuredProvider;
}
