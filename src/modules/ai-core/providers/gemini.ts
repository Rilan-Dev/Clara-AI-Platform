import { GoogleGenAI, type Content } from "@google/genai";
import { LLMProvider, ChatMessage, ChatOptions, EmbedOptions, ProviderConfig } from "../types";
import { embeddingDimensionFor, findEmbeddingModel } from "../model-catalog";

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
    const model = this.config.chatModel?.trim();
    if (!model) {
      throw new Error("No Gemini chat model is configured. Discover available models with the Gemini API and select an enabled chat model in AI settings.");
    }
    return model;
  }

  private getEmbeddingModelName(): string {
    const model = this.config.embeddingModel?.trim();
    if (!model) {
      throw new Error("No Gemini embedding model is configured. Discover available models with the Gemini API and select an enabled embedding model in AI settings.");
    }
    return model;
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

    const model = this.getChatModelName();
    // Fast turns (voice, query translation) ask for no/low reasoning; Gemini
    // Flash models then skip "thinking", which otherwise delays the first
    // token by seconds. Other models keep their default.
    const fastTurn = options?.reasoningEffort === null || options?.reasoningEffort === "low";
    const thinkingOff = fastTurn && geminiThinkingCanBeDisabled(model);
    const start = (disableThinking: boolean) =>
      this.ai.chats
        .create({
          model,
          history: conversationHistory,
          config: {
            systemInstruction,
            temperature: options?.temperature ?? 0.2,
            maxOutputTokens: options?.maxTokens,
            stopSequences: options?.stop,
            ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        })
        .sendMessageStream({ message: lastUserMessage });

    let response;
    try {
      response = await start(thinkingOff);
    } catch (error) {
      // Never let the latency hint fail a turn: retry with the model default.
      if (!thinkingOff) throw error;
      response = await start(false);
    }

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
      // WS-1.1: Gemini streams carry usageMetadata on the final chunk.
      const meta = chunk.usageMetadata;
      if (meta && options?.onUsage) {
        options.onUsage({
          promptTokens: Number(meta.promptTokenCount ?? 0),
          completionTokens: Number(meta.candidatesTokenCount ?? 0),
        });
      }
    }
  }

  async embedText(text: string, options?: EmbedOptions): Promise<number[]> {
    const result = await this.ai.models.embedContent({
      model: this.getEmbeddingModelName(),
      contents: text,
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
        ...this.embeddingOutputDimensionality(),
      },
    });
    reportEmbeddingUsage([text], [result], options);
    return result.embeddings?.[0]?.values ?? [];
  }

  async embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]> {
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
            ...this.embeddingOutputDimensionality(),
          },
        })
      )
    );
    // WS-1.1: batch usage aggregated across per-call responses.
    reportEmbeddingUsage(texts, results, options);
    return results.map((r) => r.embeddings?.[0]?.values ?? []);
  }

  getProviderName(): string {
    return "gemini";
  }

  getModelName(type: "chat" | "embedding"): string {
    if (type === "chat") {
      return this.getChatModelName();
    }
    return this.getEmbeddingModelName();
  }

  getEmbeddingDimension(): number {
    const model = this.getEmbeddingModelName();
    const configured = this.config.embeddingDimension;
    const envDim = process.env.GEMINI_EMBEDDING_DIMENSION?.trim();
    const requestedDimension = configured ?? (envDim ? Number(envDim) : null);

    // Matryoshka models (catalogued matryoshkaMaxDimension — e.g.
    // gemini-embedding-001, gemini-embedding-2-preview) emit any dimension
    // up to the max via outputDimensionality, so a requested dimension is
    // always honoured for them.
    const catalogEntry = embeddingDimensionFor(model) != null ? findEmbeddingModel(model) : undefined;
    const matryoshkaMax = catalogEntry?.matryoshkaMaxDimension ?? null;
    const isMatryoshka = matryoshkaMax != null;

    if (requestedDimension != null) {
      if (!Number.isInteger(requestedDimension) || requestedDimension <= 0 || requestedDimension > 3072) {
        throw new Error("GEMINI_EMBEDDING_DIMENSION must be a positive integer no greater than 3072.");
      }
      if (isMatryoshka && requestedDimension <= matryoshkaMax!) return requestedDimension;
      const knownDimension = embeddingDimensionFor(model);
      if (knownDimension != null && requestedDimension !== knownDimension) {
        throw new Error(
          `Configured embedding dimension ${requestedDimension} does not match the fixed output dimension ${knownDimension} for Gemini model "${model}". Re-index with a compatible model/dimension before switching.`,
        );
      }
      // Unknown models require an explicit, operator-confirmed dimension.
      return requestedDimension;
    }

    const knownDimension = embeddingDimensionFor(model);
    if (knownDimension != null) return knownDimension;
    throw new Error(
      `Unknown output dimension for Gemini embedding model "${model}". Set GEMINI_EMBEDDING_DIMENSION only after confirming the vendor output dimension and compatibility with the existing Qdrant collection.`,
    );
  }

  /**
   * Matryoshka models (catalogued matryoshkaMaxDimension — gemini-embedding-001
   * and its successors such as gemini-embedding-2-preview) emit any
   * dimensionality up to the max via outputDimensionality. Passing the pinned
   * dimension keeps vectors compatible with the Qdrant collections this
   * platform creates for the model (e.g. re-using 1536 when switching an
   * OpenAI-built collection over) — without this, a provider switch would
   * upsert 3072-dim vectors into a 1536-dim collection and every embed would
   * fail.
   */
  private embeddingOutputDimensionality(): { outputDimensionality?: number } {
    const dim = this.getEmbeddingDimension();
    const model = this.getEmbeddingModelName();
    const entry = findEmbeddingModel(model);
    if (!entry?.matryoshkaMaxDimension) return {}; // fixed-size models
    if (!Number.isFinite(dim) || dim <= 0 || dim > entry.matryoshkaMaxDimension) return {};
    return { outputDimensionality: dim };
  }
}

/**
 * WS-1.1 embedding usage for Gemini. The AI Studio embedContent response
 * carries no token count (Vertex-only `billableCharacterCount`), so usage is
 * computed from billable characters when present and otherwise estimated
 * at ~4 characters per token — the documented industry heuristic. Estimated
 * values are flagged in the metadata so dashboards can label them.
 */
function reportEmbeddingUsage(
  texts: string[],
  results: Array<{ metadata?: { billableCharacterCount?: number } }>,
  options?: EmbedOptions,
): void {
  if (!options?.onUsage || texts.length === 0) return;
  let chars = 0;
  for (let i = 0; i < texts.length; i++) {
    const billable = results[i]?.metadata?.billableCharacterCount;
    chars += billable ?? texts[i]?.length ?? 0;
  }
  if (chars <= 0) return;
  options.onUsage({ promptTokens: Math.ceil(chars / 4), completionTokens: 0 });
}

/** Gemini Flash models accept thinkingBudget 0 (thinking off); Pro does not. */
export function geminiThinkingCanBeDisabled(model: string): boolean {
  return /gemini-2\.5-flash/i.test(model.trim());
}
