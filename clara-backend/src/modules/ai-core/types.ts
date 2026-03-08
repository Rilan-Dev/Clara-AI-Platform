export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
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
  embedText(text: string): Promise<number[]>;

  /**
   * Generates embeddings for an array of text strings.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

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
  provider: 'openai' | 'gemini';
  apiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
}
