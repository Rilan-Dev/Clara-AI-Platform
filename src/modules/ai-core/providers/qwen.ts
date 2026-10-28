/**
 * src/modules/ai-core/providers/qwen.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Embedding-only provider for the self-hosted Qwen3-Embedding service.
 *
 * Talks to the local llama.cpp `llama-server` container (service
 * `qwen-embeddings` in docker-compose.yml) through its OpenAI-compatible
 * /v1/embeddings endpoint. No vendor billing, no egress: vectors are computed
 * on the platform host itself.
 *
 *   embedText(text)    → a QUERY   (Qwen3 instruct format: "Instruct: …\nQuery: …")
 *   embedBatch(texts)  → DOCUMENTS (raw passage text)
 *
 * The server is optional: it only serves embeddings when a caller resolves to
 * this provider (platform embedding default or the AI_EMBEDDING_PROVIDER
 * override). An unreachable server fails the caller loudly — never a silent
 * fallback to a cloud provider, because Qdrant collections are dimension-
 * pinned to whichever model built them (Qwen3-Embedding-0.6B → 1024).
 *
 * Vectors are L2-normalised so cosine scores match the model card.
 */

import { netTraceUpstream } from "@/lib/net-trace";
import type { ChatMessage, ChatOptions, EmbedOptions, LLMProvider, ProviderConfig } from "../types";
import { findEmbeddingModel } from "../model-catalog";

export const QWEN_DEFAULT_MODEL = "Qwen/Qwen3-Embedding-0.6B";
export const QWEN_DEFAULT_BASE_URL = "http://qwen-embeddings:8080";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Retrieval task description for query embeddings (Qwen3-Embedding model-card
 * format — same E5-style "Instruct: {task}\nQuery: {text}" template).
 */
const DEFAULT_QUERY_TASK =
  "Given a question, retrieve passages from the knowledge base that answer the question";

/** The base URL of the local embeddings server (env-configurable). */
export function qwenEmbeddingsBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.QWEN_EMBEDDINGS_BASE_URL?.trim();
  if (!raw) return `${QWEN_DEFAULT_BASE_URL}/v1/embeddings`;
  // Accept a bare host, an OpenAI-style …/v1 base or a full …/embeddings URL —
  // the same normalisation the multilingual TEI client performs.
  const base = raw.replace(/\/+$/, "");
  if (/\/embeddings$/i.test(base)) return base;
  if (/\/v\d+(\/openai)?$/i.test(base)) return `${base}/embeddings`;
  return `${base}/v1/embeddings`;
}

/** The /v1/models discovery endpoint of the local embeddings server. */
export function qwenModelsEndpoint(env: Record<string, string | undefined> = process.env): string {
  let base = (env.QWEN_EMBEDDINGS_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return `${QWEN_DEFAULT_BASE_URL}/v1/models`;
  if (/\/embeddings$/i.test(base)) base = base.replace(/\/embeddings$/i, "");
  if (/\/v\d+(\/openai)?$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export class QwenEmbeddingProvider implements LLMProvider {
  private readonly model: string;
  private readonly dimension: number;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: ProviderConfig) {
    this.model =
      config.embeddingModel?.trim() ||
      process.env.QWEN_EMBEDDING_MODEL?.trim() ||
      QWEN_DEFAULT_MODEL;
    const envDimension = Number(process.env.QWEN_EMBEDDING_DIMENSION);
    this.dimension =
      config.embeddingDimension ??
      (Number.isFinite(envDimension) && envDimension > 0 ? envDimension : undefined) ??
      findEmbeddingModel(this.model)?.dimension ??
      1024;
    this.baseUrl = config.baseUrl?.trim() || qwenEmbeddingsBaseUrl();
    this.apiKey = config.apiKey?.trim() || process.env.QWEN_API_KEY?.trim() || undefined;
  }

  async *chatStream(_messages: ChatMessage[], _options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    void _messages;
    void _options;
    throw new Error("The Qwen embeddings provider serves embeddings only.");
  }

  async embedText(text: string, options?: EmbedOptions): Promise<number[]> {
    const [vector] = await this.request([this.formatQuery(text)], options);
    if (!vector) throw new Error("The Qwen embeddings endpoint returned no vector.");
    return vector;
  }

  async embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.request(texts, options);
  }

  getProviderName(): string {
    return "qwen";
  }

  getModelName(type: "chat" | "embedding"): string {
    return type === "embedding" ? this.model : "";
  }

  getEmbeddingDimension(): number {
    return this.dimension;
  }

  private formatQuery(text: string): string {
    const task = process.env.QWEN_EMBEDDINGS_QUERY_TASK?.trim() || DEFAULT_QUERY_TASK;
    return `Instruct: ${task}\nQuery: ${text}`;
  }

  private async request(inputs: string[], options?: EmbedOptions): Promise<number[][]> {
    const url = this.baseUrl;
    const body = { model: this.model, input: inputs, encoding_format: "float" };
    const timeoutRaw = Number(process.env.QWEN_EMBEDDINGS_TIMEOUT_MS);
    const timeout = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS;
    const beganAt = Date.now();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      netTraceUpstream({
        provider: "qwen",
        url,
        durationMs: Date.now() - beganAt,
        requestBody: body,
        error,
      });
      throw new Error(
        `The local Qwen embeddings server is unreachable (${url}). ` +
          "Verify the qwen-embeddings service is running (docker compose ps qwen-embeddings).",
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      netTraceUpstream({
        provider: "qwen",
        url,
        status: response.status,
        durationMs: Date.now() - beganAt,
        requestBody: body,
      });
      const error = new Error(
        `Qwen embeddings request failed (HTTP ${response.status}): ${detail}`,
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    } | null;
    if (!payload || !Array.isArray(payload.data)) {
      netTraceUpstream({ provider: "qwen", url, status: response.status, durationMs: Date.now() - beganAt });
      throw new Error("The Qwen embeddings endpoint returned a malformed response.");
    }

    const rows = [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== inputs.length || rows.some((row) => !Array.isArray(row.embedding))) {
      netTraceUpstream({
        provider: "qwen",
        url,
        status: response.status,
        durationMs: Date.now() - beganAt,
        responseBody: { embeddings: rows.length, requests: inputs.length },
      });
      throw new Error(
        `The Qwen embeddings endpoint returned ${rows.length} vectors for ${inputs.length} inputs.`,
      );
    }

    const vectors = rows.map((row) => normalise(row.embedding!));
    netTraceUpstream({
      provider: "qwen",
      url,
      status: response.status,
      durationMs: Date.now() - beganAt,
      responseBody: { embeddings: vectors.length, requests: inputs.length },
    });
    if (this.dimension > 0 && vectors[0] && vectors[0].length !== this.dimension) {
      throw new Error(
        `Model "${this.model}" returned ${vectors[0].length}-dimensional vectors; the platform expects ` +
        `${this.dimension}. Set QWEN_EMBEDDING_DIMENSION to the served model's true dimension.`,
      );
    }

    const tokens = payload.usage?.prompt_tokens ?? payload.usage?.total_tokens;
    if (typeof tokens === "number") options?.onUsage?.({ promptTokens: tokens, completionTokens: 0 });
    return vectors;
  }
}
