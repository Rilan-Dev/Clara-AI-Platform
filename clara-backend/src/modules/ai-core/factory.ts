import { LLMProvider, ProviderConfig } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";

export class ProviderFactory {
  private static instance: LLMProvider | null = null;

  /**
   * Returns a singleton instance of the configured LLM Provider.
   * If no config is provided, it reads from environment variables.
   *
   * FIX: Changed from NEXT_PUBLIC_AI_PROVIDER to AI_PROVIDER.
   *
   * NEXT_PUBLIC_ variables are statically inlined into the browser JS bundle at
   * build time by Next.js. ProviderFactory is used exclusively in server-side
   * code (chat.ts, vector-store.ts, hybrid-search.ts). Exposing the provider
   * name in the client bundle is unnecessary. AI_PROVIDER is server-only.
   *
   * For client-side provider routing (useVoiceClient), NEXT_PUBLIC_AI_PROVIDER
   * is still appropriate — it's the provider name, not an API key, so exposure
   * is acceptable. But the factory itself should never run in the browser.
   */
  static getProvider(config?: ProviderConfig): LLMProvider {
    if (this.instance && !config) {
      return this.instance;
    }

    const providerType =
      config?.provider || process.env.AI_PROVIDER || "openai";

    switch (providerType.toLowerCase()) {
      case "openai":
        this.instance = new OpenAIProvider(config);
        break;
      case "gemini":
        this.instance = new GeminiProvider(config);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${providerType}`);
    }

    return this.instance;
  }

  /**
   * Forces the factory to create a new instance on the next call.
   * Useful for testing or dynamic configuration changes.
   */
  static reset() {
    this.instance = null;
  }
}
