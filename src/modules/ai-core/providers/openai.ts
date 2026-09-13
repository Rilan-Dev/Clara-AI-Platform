import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { LLMProvider, ChatMessage, ChatOptions, ProviderConfig } from "../types";

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

/**
 * GPT-5.6 reasoning models use the provider default sampling configuration.
 * Sending a custom temperature causes OpenAI to reject the request with an
 * unsupported-value error, so the field must be omitted entirely.
 */
const REASONING_MODEL_PATTERN = /^gpt-5(?:\.\d+)?(?:-(?:luna|terra|sol))?$/i;

export function supportsTemperature(model: string): boolean {
  return !REASONING_MODEL_PATTERN.test(model.trim());
}

/**
 * Reasoning models (o-series, GPT-5.x Luna/Terra/Sol) reject the legacy
 * `max_tokens` parameter and require `max_completion_tokens` instead.
 */
export function usesMaxCompletionTokens(model: string): boolean {
  return REASONING_MODEL_PATTERN.test(model.trim());
}

export class OpenAIProvider implements LLMProvider {
  private config: ProviderConfig;
  private client: OpenAI;

  constructor(config?: ProviderConfig) {
    this.config = config ?? { provider: "openai" };
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your environment or provide it in the config."
      );
    }
    // Explicit timeout so unreachable networks fail in OPENAI_TIMEOUT_MS (60s
    // default) with a clear error instead of hanging for the SDK's 10-minute
    // default. SDK-level retries stay at 1 — vector-store-kb adds its own
    // backoff for embeddings, and chat streams handle retries upstream.
    const timeoutMs = (() => {
      const v = Number(process.env.OPENAI_TIMEOUT_MS ?? "60000");
      return Number.isFinite(v) && v > 0 ? v : 60_000;
    })();
    this.client = new OpenAI({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 1,
      // baseURL defaults to OPENAI_BASE_URL env (SDK behaviour) when unset.
    });
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

    const request: ChatCompletionCreateParamsStreaming = {
      model,
      messages: openaiMessages,
      stop: options?.stop,
      stream: true,
    };

    // Reasoning models (o-series, GPT-5.x Luna/Terra/Sol) require
    // `max_completion_tokens` — the legacy `max_tokens` param is rejected.
    if (options?.maxTokens != null) {
      if (usesMaxCompletionTokens(model)) {
        request.max_completion_tokens = options.maxTokens;
      } else {
        request.max_tokens = options.maxTokens;
      }
    }

    // GPT-5.6 Luna/Terra/Sol reject custom temperature values. Omit the field
    // completely so the API applies its model default.
    if (supportsTemperature(model)) {
      request.temperature = options?.temperature ?? 0.2;
    }

    const stream = await this.client.chat.completions.create(request);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
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
    if (type === "chat") return this.config.chatModel ?? DEFAULT_CHAT_MODEL;
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
