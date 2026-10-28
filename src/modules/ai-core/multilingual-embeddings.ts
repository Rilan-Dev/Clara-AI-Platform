/**
 * src/modules/ai-core/multilingual-embeddings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multilingual knowledge index — the embedding models ElevenLabs Agents offer
 * for RAG, served from an endpoint the platform admin configures.
 *
 * ElevenLabs computes a RAG index per document per embedding model and offers
 *   • e5_mistral_7b_instruct          (4096-d, English-focused)
 *   • multilingual_e5_large_instruct  (1024-d, ~100 languages)
 * Clara serves the same capability through any OpenAI-compatible
 * /v1/embeddings server:
 *   • VPS (self-hosted): the `qwen-embeddings` service in docker-compose.yml —
 *     Qwen3-Embedding-0.6B (1024-d, 100+ languages, 32k context), a drop-in
 *     successor to the retired heavyweight multilingual-e5-large TEI service
 *     (~2 GB RAM) at roughly a third of the footprint.
 *   • Vercel (cloud):    a hosted endpoint serving a compatible model
 *
 * Nothing tenant-specific here: the endpoint, key and model are platform
 * runtime settings (Settings → AI), and plans decide who may use it.
 */

export type MultilingualModelFamily = "e5-instruct" | "e5" | "qwen" | "plain";

export type MultilingualEmbeddingModel = {
  id: string;
  label: string;
  dimension: number;
  family: MultilingualModelFamily;
  /** Languages the model was trained for (approximate, for the UI). */
  languages: number;
  /** The equivalent ElevenLabs RAG model id, when there is one. */
  elevenLabsModel?: string;
  /** Maximum input tokens; longer chunks are truncated by the server. */
  maxTokens: number;
};

export const MULTILINGUAL_EMBEDDING_MODELS: MultilingualEmbeddingModel[] = [
  {
    id: "Qwen/Qwen3-Embedding-0.6B",
    label: "Qwen3 Embedding 0.6B (local, 100+ languages)",
    dimension: 1024,
    family: "qwen",
    languages: 100,
    maxTokens: 32768,
  },
  {
    id: "BAAI/bge-m3",
    label: "BGE-M3",
    dimension: 1024,
    family: "plain",
    languages: 100,
    maxTokens: 8192,
  },
];

export const DEFAULT_MULTILINGUAL_MODEL = "Qwen/Qwen3-Embedding-0.6B";

/**
 * Retrieval task description for instruct models (E5 model card format:
 * "Instruct: {task}\nQuery: {query}"; passages are embedded as-is).
 */
const DEFAULT_QUERY_TASK = "Given a question, retrieve passages from the knowledge base that answer the question";

export function findMultilingualModel(id: string | null | undefined): MultilingualEmbeddingModel | undefined {
  const needle = (id ?? "").trim().toLowerCase();
  return MULTILINGUAL_EMBEDDING_MODELS.find((m) => m.id.toLowerCase() === needle);
}

/** Model family by id — unknown ids fall back to naming conventions. */
export function modelFamily(id: string): MultilingualModelFamily {
  const known = findMultilingualModel(id);
  if (known) return known.family;
  const lower = id.toLowerCase();
  if (lower.includes("qwen") && lower.includes("embedding")) return "qwen";
  if (lower.includes("e5") && lower.includes("instruct")) return "e5-instruct";
  if (/(^|[/_-])e5([/_-]|$)/.test(lower) || lower.includes("-e5-")) return "e5";
  return "plain";
}

/**
 * Text as the model expects it. E5 models were trained with prefixes and
 * lose quality without them; Qwen3-Embedding uses the same instruct-style
 * query template (task description + query, documents raw); "plain" models
 * (BGE-M3) take raw text.
 */
export function formatEmbeddingInput(
  text: string,
  kind: "query" | "document",
  model: string,
  queryTask = process.env.MULTILINGUAL_EMBEDDINGS_QUERY_TASK?.trim() || DEFAULT_QUERY_TASK,
): string {
  const family = modelFamily(model);
  if (family === "e5-instruct") return kind === "query" ? `Instruct: ${queryTask}\nQuery: ${text}` : text;
  if (family === "qwen") return kind === "query" ? `Instruct: ${queryTask}\nQuery: ${text}` : text;
  if (family === "e5") return `${kind === "query" ? "query" : "passage"}: ${text}`;
  return text;
}

/**
 * The embeddings URL for a configured base URL. Accepts a bare host
 * (llama.cpp: http://qwen-embeddings:8080), an OpenAI-style base (…/v1,
 * …/v1/openai) or the full …/embeddings URL.
 */
export function embeddingsEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/\/embeddings$/i.test(base)) return base;
  if (/\/v\d+(\/openai)?$/i.test(base)) return `${base}/embeddings`;
  return `${base}/v1/embeddings`;
}

export type MultilingualSettings = {
  /** Platform admin switch. */
  enabled: boolean;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  dimension: number;
  /** Endpoint set and model dimension known. */
  configured: boolean;
  /** Enabled AND configured — offered to entitled organisations. */
  available: boolean;
};

export function getMultilingualSettings(env: Record<string, string | undefined> = process.env): MultilingualSettings {
  const enabled = (env.MULTILINGUAL_EMBEDDINGS_ENABLED ?? "").trim().toLowerCase() === "true";
  const baseUrl = (env.MULTILINGUAL_EMBEDDINGS_BASE_URL ?? "").trim();
  const apiKey = env.MULTILINGUAL_EMBEDDINGS_API_KEY?.trim() || undefined;
  const model = env.MULTILINGUAL_EMBEDDINGS_MODEL?.trim() || DEFAULT_MULTILINGUAL_MODEL;
  const explicit = Number(env.MULTILINGUAL_EMBEDDINGS_DIMENSION);
  const dimension = Number.isFinite(explicit) && explicit > 0
    ? Math.floor(explicit)
    : findMultilingualModel(model)?.dimension ?? 0;
  const configured = Boolean(baseUrl) && dimension > 0;
  return { enabled, baseUrl, apiKey, model, dimension, configured, available: enabled && configured };
}

/**
 * Minimum cosine similarity for a chunk to count as evidence, per model.
 * E5 models score everything between ~0.7 and 1.0 (low-temperature
 * contrastive training — see the E5 model card), so the 0.25 cut-off used
 * for OpenAI/Gemini embeddings would admit unrelated chunks. Qwen3-Embedding
 * behaves like the OpenAI/Gemini families (scores spread across the full
 * 0–1 range) but sits slightly higher on related passages — 0.35. Override
 * with MULTILINGUAL_EMBEDDINGS_SCORE_THRESHOLD.
 */
export function scoreThresholdFor(
  provider: string | null | undefined,
  model: string | null | undefined,
  standardThreshold: number,
  env: Record<string, string | undefined> = process.env,
): number {
  if (provider !== "tei") return standardThreshold;
  const override = Number(env.MULTILINGUAL_EMBEDDINGS_SCORE_THRESHOLD);
  if (Number.isFinite(override) && override > 0 && override < 1) return override;
  const family = modelFamily(model ?? "");
  if (family === "plain") return 0.45;
  if (family === "qwen") return 0.35;
  return 0.8;
}
