export type AIProvider = "openai" | "gemini";

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Token usage reported by the provider for one invocation (WS-1.1 metering).
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /**
   * Called exactly once when the provider reports final usage for the
   * stream. Usage-event metering hangs off this — never off guesswork.
   */
  onUsage?: (usage: TokenUsage) => void;
}

export interface EmbedOptions {
  /** Usage callback for embedding batches (ingestion metering). */
  onUsage?: (usage: TokenUsage) => void;
}

export interface LLMProvider {
  /**
   * Generates a chat completion stream.
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Generates an embedding for a single text string.
   */
  embedText(text: string, options?: EmbedOptions): Promise<number[]>;

  /**
   * Generates embeddings for an array of text strings.
   */
  embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]>;

  /**
   * Returns the name of the provider (e.g., 'openai', 'gemini').
   */
  getProviderName(): string;

  /**
   * Returns the model name being used for the specified type.
   */
  getModelName(type: 'chat' | 'embedding'): string;

  /**
   * Returns the output dimension of the embedding model.
   */
  getEmbeddingDimension(): number;
}

export interface ProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
}
