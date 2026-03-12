import { GoogleGenAI, type Content } from "@google/genai";
import { LLMProvider, ChatMessage, ChatOptions, ProviderConfig } from "../types";

const DEFAULT_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-2.0-flash";
const DEFAULT_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004";

export class GeminiProvider implements LLMProvider {
  private config: ProviderConfig;
  private ai: GoogleGenAI;

  constructor(config?: ProviderConfig) {
    this.config = config ?? { provider: "gemini" };
    const apiKey =
      this.config.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to your environment or provide it in the config."
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private getChatModelName(): string {
    return this.config.chatModel ?? DEFAULT_CHAT_MODEL;
  }

  private getEmbeddingModelName(): string {
    return this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string, void, unknown> {
    // Separate system instruction from conversation history
    const systemParts: string[] = [];
    const conversationHistory: Content[] = [];
    let lastUserMessage = "";

    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      }
    }

    // Build history: all non-system messages except the last one
    const nonSystemMessages = messages.filter((m) => m.role !== "system");
    for (let i = 0; i < nonSystemMessages.length - 1; i++) {
      const m = nonSystemMessages[i];
      conversationHistory.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    // Use the last non-system message as the send message
    const lastNonSystem = nonSystemMessages[nonSystemMessages.length - 1];
    if (lastNonSystem) {
      lastUserMessage = lastNonSystem.content;
    }

    const systemInstruction =
      systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

    const chat = this.ai.chats.create({
      model: this.getChatModelName(),
      history: conversationHistory,
      config: {
        systemInstruction,
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens,
        stopSequences: options?.stop,
      },
    });

    const response = await chat.sendMessageStream({
      message: lastUserMessage,
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  }

  async embedText(text: string): Promise<number[]> {
    const result = await this.ai.models.embedContent({
      model: this.getEmbeddingModelName(),
      contents: text,
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
      },
    });
    return result.embeddings?.[0]?.values ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // The new SDK doesn't have a direct batchEmbedContents method on models,
    // so we use Promise.all with individual embedContent calls for now.
    // For large batches, consider chunking.
    const results = await Promise.all(
      texts.map((text) =>
        this.ai.models.embedContent({
          model: this.getEmbeddingModelName(),
          contents: text,
          config: {
            taskType: "RETRIEVAL_DOCUMENT",
          },
        })
      )
    );
    return results.map((r) => r.embeddings?.[0]?.values ?? []);
  }

  getProviderName(): string {
    return "gemini";
  }

  getModelName(type: "chat" | "embedding"): string {
    if (type === "chat") {
      return this.config.chatModel ?? DEFAULT_CHAT_MODEL;
    }
    return this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  getEmbeddingDimension(): number {
    if (this.config.embeddingDimension) return this.config.embeddingDimension;
    const envDim = process.env.GEMINI_EMBEDDING_DIMENSION;
    if (envDim) return Number(envDim);

    const model = this.getEmbeddingModelName();
    if (model.includes("gemini-embedding-001")) return 3072;
    return 768;
  }
}
