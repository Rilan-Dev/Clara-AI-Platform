import { GoogleGenAI, type Content, type EmbedContentResponse } from "@google/genai";
import { LLMProvider, ChatMessage, ChatOptions, EmbedOptions, ProviderConfig } from "../types";
import { embeddingDimensionFor, findEmbeddingModel } from "../model-catalog";
import { netTraceUpstream } from "@/lib/net-trace";

/**
 * Display base URL for [net-trace] upstream rows — relay-aware so the row
 * shows the endpoint the SDK is actually hitting (GEMINI_BASE_URL when set,
 * generativelanguage.googleapis.com otherwise). Silent on invalid values:
 * construction-time geminiHttpOptions() already warned once.
 */
function geminiTraceBase(): string {
  const raw = process.env.GEMINI_BASE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString().replace(/\/+$/, "");
      }
    } catch {
      // fall through to the official endpoint for display purposes
    }
  }
  return "https://generativelanguage.googleapis.com";
}

/**
 * Optional relay for deployments whose servers cannot reach
 * generativelanguage.googleapis.com directly (restricted networks, regional
 * blocks, DPI-filtered ISPs): set GEMINI_BASE_URL to an HTTPS forwarder that
 * proxies the Google AI Studio API. Invalid values are ignored with a
 * warning so a typo cannot break every Gemini call.
 */
function geminiHttpOptions(): { httpOptions?: { baseUrl: string } } {
  const raw = process.env.GEMINI_BASE_URL?.trim();
  if (!raw) return {};
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`unsupported protocol "${url.protocol}"`);
    }
    return { httpOptions: { baseUrl: url.toString() } };
  } catch (error) {
    console.warn(`[gemini] ignoring invalid GEMINI_BASE_URL "${raw}": ${(error as Error).message}`);
    return {};
  }
}

/**
 * Models whose MULTI-REQUEST batchEmbedContents contract is broken on the
 * live Google API: the endpoint answers HTTP 200 but embeds only a subset of
 * the requests (observed in production, deterministic across containers:
 * gemini-embedding-2-preview returned 1 embedding for 20 inputs while a
 * 1-request batch embeds fine — so the request wire format is valid and the
 * model, not the transport, is the problem). Keyed by model, module-level:
 * provider instances are recreated per batch, so instance state cannot carry
 * the degradation. Process-lifetime only — a restart re-probes batching.
 */
const modelsWithBrokenBatchContract = new Set<string>();

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
    this.ai = new GoogleGenAI({ apiKey, ...geminiHttpOptions() });
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

    // [net-trace] upstream row for the vendor call the browser can never see
    // (server-side egress): the streamGenerateContent request that opens the
    // SSE stream. Failures (401/429/timeout) are ALWAYS captured with their
    // HTTP status; successes print at NET_TRACE=verbose only.
    const chatUrl = `${geminiTraceBase()}/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    const startTraced = async (disableThinking: boolean, attempt?: number) => {
      const requestBody = {
        model,
        historyMessages: conversationHistory.length,
        message: lastUserMessage,
        ...(disableThinking ? { thinkingOff: true } : {}),
      };
      const startedAt = Date.now();
      try {
        const stream = await start(disableThinking);
        netTraceUpstream({
          provider: "gemini",
          url: chatUrl,
          status: 200,
          durationMs: Date.now() - startedAt,
          attempt,
          requestBody,
          responseBody: { stream: "opened" },
        });
        return stream;
      } catch (error) {
        netTraceUpstream({
          provider: "gemini",
          url: chatUrl,
          durationMs: Date.now() - startedAt,
          attempt,
          requestBody,
          error,
        });
        throw error;
      }
    };

    let response;
    try {
      response = await startTraced(thinkingOff);
    } catch (error) {
      // Never let the latency hint fail a turn: retry with the model default.
      if (!thinkingOff) throw error;
      response = await startTraced(false, 2);
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
    const model = this.getEmbeddingModelName();
    // The SDK serialises every embedContent onto POST {model}:batchEmbedContents
    // (single- or multi-request) — the URL the Network tab would show.
    const url = `${geminiTraceBase()}/v1beta/models/${model}:batchEmbedContents`;
    const startedAt = Date.now();
    let result: EmbedContentResponse;
    try {
      result = await this.ai.models.embedContent({
        model,
        contents: text,
        config: {
          taskType: "RETRIEVAL_DOCUMENT",
          ...this.embeddingOutputDimensionality(),
        },
      });
    } catch (error) {
      netTraceUpstream({ provider: "gemini", url, durationMs: Date.now() - startedAt, requestBody: text, error });
      throw error;
    }
    netTraceUpstream({
      provider: "gemini",
      url,
      status: 200,
      durationMs: Date.now() - startedAt,
      requestBody: text,
      responseBody: {
        embeddings: result.embeddings?.length ?? 0,
        dimension: result.embeddings?.[0]?.values?.length ?? 0,
      },
    });
    reportEmbeddingUsage([text], [result], options);
    return result.embeddings?.[0]?.values ?? [];
  }

  async embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]> {
    if (texts.length === 0) return [];

    const model = this.getEmbeddingModelName();

    // ONE HTTP round-trip for the whole batch. The @google/genai SDK maps
    // `contents: string[]` onto POST {model}:batchEmbedContents — a single
    // request carrying every text, with config.taskType and
    // config.outputDimensionality applied to EACH embedded request, and
    // embeddings[] returned in input order (verified against the SDK's wire
    // serialization in gemini.relay.integration.test.ts).
    //
    // This replaces Promise.all(texts.map(embedContent)) — N simultaneous
    // TCP connects to generativelanguage.googleapis.com. That fan-out was the
    // production root cause for "document extractions and embeddings not
    // working": the same host completed a single-connection embedding test in
    // ~900ms while every ingest batch died with ConnectTimeoutError (20s per
    // attempt, 20 connections at once) — a connection burst the deployment's
    // network drops. One connection per batch matches the profile that works.
    if (texts.length > 1 && !modelsWithBrokenBatchContract.has(model)) {
      const url = `${geminiTraceBase()}/v1beta/models/${model}:batchEmbedContents`;
      const startedAt = Date.now();
      try {
        const result = await this.ai.models.embedContent({
          model,
          contents: texts,
          config: {
            taskType: "RETRIEVAL_DOCUMENT",
            ...this.embeddingOutputDimensionality(),
          },
        });
        const embeddings = result.embeddings ?? [];
        // Verbose-only row, but the compact res summary makes the production
        // contract break visible right here: {"embeddings":1,"requests":20}.
        netTraceUpstream({
          provider: "gemini",
          url,
          status: 200,
          durationMs: Date.now() - startedAt,
          requestBody: texts,
          responseBody: {
            embeddings: embeddings.length,
            requests: texts.length,
            dimension: embeddings[0]?.values?.length ?? 0,
          },
        });
        if (embeddings.length === texts.length) {
          reportEmbeddingUsage(texts, [result], options);
          return embeddings.map((e) => e.values ?? []);
        }
        // COUNT MISMATCH — the provider embedded only a subset of the
        // requests (production signature: "Embedding provider returned 1
        // vectors for 20 inputs", deterministic while a 1-request batch of
        // the same model embeds fine — so this is a provider/model quirk,
        // not transport and not our request shape). The partial response
        // cannot be trusted for alignment: which texts the returned vectors
        // correspond to is unknowable, so the whole attempt is discarded.
        // Degrade THIS model to sequential single-request embeds for the
        // life of the process — the exact shape every verified-working path
        // (platform embedding-default test, egress probe, embedText) uses —
        // and fall through to the sequential loop below.
        modelsWithBrokenBatchContract.add(model);
        console.error(
          `[gemini] ${model} returned ${embeddings.length} embedding(s) for ${texts.length} request(s) — ` +
            `multi-request batches are unreliable for this model on this endpoint; degrading to sequential ` +
            `single-text embeds for the life of this process (a restart re-probes batching).`,
        );
      } catch (err) {
        netTraceUpstream({
          provider: "gemini",
          url,
          durationMs: Date.now() - startedAt,
          requestBody: texts,
          error: err,
        });
        // Defensive split for undocumented per-batch caps (payload size /
        // request count): halve SEQUENTIALLY — never reintroduce the parallel
        // fan-out this method exists to avoid — until the leaf call surfaces
        // the provider's real error when size is not the problem.
        if (texts.length > 1 && isBatchSizeError(err)) {
          const mid = Math.floor(texts.length / 2);
          const left = await this.embedBatch(texts.slice(0, mid), options);
          const right = await this.embedBatch(texts.slice(mid), options);
          return [...left, ...right];
        }
        throw err;
      }
    }

    // Sequential single-request embeds — one request per text, in input
    // order, at most one in flight (undici keep-alive reuses the socket).
    // Slower than a true batch, but it is the only shape verified to work
    // end-to-end on every deployment so far, and it never fans out.
    const vectors: number[][] = [];
    const perTextResults: Array<{ metadata?: { billableCharacterCount?: number } }> = [];
    const seqUrl = `${geminiTraceBase()}/v1beta/models/${model}:batchEmbedContents`;
    for (let i = 0; i < texts.length; i++) {
      const seqStartedAt = Date.now();
      let result: EmbedContentResponse;
      try {
        result = await this.ai.models.embedContent({
          model,
          contents: texts[i],
          config: {
            taskType: "RETRIEVAL_DOCUMENT",
            ...this.embeddingOutputDimensionality(),
          },
        });
      } catch (error) {
        netTraceUpstream({
          provider: "gemini",
          url: seqUrl,
          durationMs: Date.now() - seqStartedAt,
          requestBody: texts[i],
          error,
        });
        throw error;
      }
      netTraceUpstream({
        provider: "gemini",
        url: seqUrl,
        status: 200,
        durationMs: Date.now() - seqStartedAt,
        requestBody: texts[i],
        responseBody: {
          embeddings: result.embeddings?.length ?? 0,
          dimension: result.embeddings?.[0]?.values?.length ?? 0,
        },
      });
      const vector = result.embeddings?.[0]?.values ?? [];
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error(
          `Embedding provider returned an empty vector for input ${i + 1}/${texts.length}`,
        );
      }
      vectors.push(vector);
      perTextResults.push(result);
    }
    // WS-1.1: one aggregated usage event for the whole call (per-text
    // billableCharacterCount when present, else the character-sum estimate).
    reportEmbeddingUsage(texts, perTextResults, options);
    return vectors;
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
 *
 * `results` is either one response per text (embedText path and embedBatch's
 * sequential-singles fallback) or a single response for the whole batch
 * (embedBatch's one-request fast path): a lone response for many texts
 * reports the batch total when the backend provides billable characters,
 * else the char-sum estimate.
 */
function reportEmbeddingUsage(
  texts: string[],
  results: Array<{ metadata?: { billableCharacterCount?: number } }>,
  options?: EmbedOptions,
): void {
  if (!options?.onUsage || texts.length === 0) return;
  let chars = 0;
  if (results.length === 1 && texts.length > 1) {
    chars = results[0]?.metadata?.billableCharacterCount ?? sumTextLengths(texts);
  } else {
    for (let i = 0; i < texts.length; i++) {
      chars += results[i]?.metadata?.billableCharacterCount ?? texts[i]?.length ?? 0;
    }
  }
  if (chars <= 0) return;
  options.onUsage({ promptTokens: Math.ceil(chars / 4), completionTokens: 0 });
}

function sumTextLengths(texts: string[]): number {
  let total = 0;
  for (const text of texts) total += text?.length ?? 0;
  return total;
}

/**
 * 4xx responses that indicate the SINGLE batch request itself is too big
 * (payload size / request count) rather than the content being invalid.
 * Triggers the sequential split fallback in embedBatch.
 */
function isBatchSizeError(err: unknown): boolean {
  const e = err as { status?: unknown; message?: string };
  const status = typeof e?.status === "number" ? e.status : null;
  const message = String(e?.message ?? "").toLowerCase();
  if (status === 413) return true;
  if (status === 400 || status === 422) {
    return /too (large|many|long)|exceeds?\b|limit|maximum|payload|batch size/.test(message);
  }
  return false;
}

/** Gemini Flash models accept thinkingBudget 0 (thinking off); Pro does not. */
export function geminiThinkingCanBeDisabled(model: string): boolean {
  return /gemini-2\.5-flash/i.test(model.trim());
}

/**
 * Test hook: forget recorded per-model batch-contract degradations so each
 * test starts from the real fast path (module state otherwise persists
 * across tests in the same file — exactly like across batches in a process).
 */
export function resetEmbeddingBatchDiagnosticsForTests(): void {
  modelsWithBrokenBatchContract.clear();
}
