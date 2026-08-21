import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LLMProvider, ChatMessage, ChatOptions, ProviderConfig } from "../types";

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export class OpenAIProvider implements LLMProvider {
  private config: ProviderConfig;
  private client: OpenAI;

  constructor(config?: ProviderConfig) {
    this.config = config ?? { provider: "openai" };
    const apiKey =
      this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your environment or provide it in the config."
      );
    }
    this.client = new OpenAI({ apiKey });
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown> {
    const model = this.config.chatModel ?? DEFAULT_CHAT_MODEL;

    const openaiMessages: ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const isGpt5Family = model.toLowerCase().startsWith("gpt-5");
    const completionOptions = isGpt5Family
      ? {
          max_completion_tokens: options?.maxTokens,
        }
      : {
          max_tokens: options?.maxTokens,
        };

    const stream = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      temperature: options?.temperature ?? 0.2,
      ...completionOptions,
      stop: options?.stop,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  async embedText(text: string): Promise<number[]> {
    const model = this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const response = await this.client.embeddings.create({
      input: text,
      model,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("Failed to generate embedding for the provided text.");
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const model = this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const response = await this.client.embeddings.create({
      input: texts,
      model,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  getProviderName(): string {
    return "openai";
  }

  getModelName(type: "chat" | "embedding"): string {
    if (type === "chat") {
      return this.config.chatModel ?? DEFAULT_CHAT_MODEL;
    }
    return this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  getEmbeddingDimension(): number {
    if (this.config.embeddingDimension) return this.config.embeddingDimension;
    const model = this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const envDim = process.env.OPENAI_EMBEDDING_DIMENSION;
    if (envDim) return Number(envDim);
    if (model === "text-embedding-3-large") return 3072;
    return 1536;
  }
}
