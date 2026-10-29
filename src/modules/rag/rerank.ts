/**
 * Optional second-stage, model-based RAG reranking using a self-hosted
 * Hugging Face Text Embeddings Inference (TEI) /rerank endpoint.
 *
 * Security: call only a server-operator configured endpoint, after the
 * existing tenant/KB-filtered retrieval. Never log query or source text.
 * Ranking scores are separate from Qdrant similarity/citation scores.
 */
export type Reranked<T> = T & { rerankScore?: number };

export async function rerankCandidates<T>(
  query: string,
  candidates: readonly T[],
  getText: (candidate: T) => string,
  options: { disabled?: boolean } = {},
): Promise<Array<Reranked<T>>> {
  const fallback = [...candidates];
  const url = process.env.RAG_RERANK_URL?.trim();
  const enabled = process.env.RAG_RERANK_ENABLED?.trim().toLowerCase();
  if (
    options.disabled ||
    !url ||
    enabled === "false" ||
    enabled === "0" ||
    enabled === "off" ||
    !query.trim() ||
    candidates.length < 2
  ) return fallback;

  // The URL is deployment-owned, never accepted from a user/tenant request.
  try {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") return fallback;
  } catch {
    return fallback;
  }

  const timeout = Number(process.env.RAG_RERANK_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeout) && timeout > 0
    ? Math.min(Math.max(timeout, 100), 15_000)
    : 1_500;
  // Bound CPU cost: a multilingual search may yield up to 60 candidates.
  // Keep the unscored tail, which document diversification can still select.
  const configuredLimit = Number(process.env.RAG_RERANK_MAX_CANDIDATES);
  const maxCandidates = Number.isFinite(configuredLimit) && configuredLimit >= 2
    ? Math.min(Math.floor(configuredLimit), 30)
    : 12;
  const head = candidates.slice(0, maxCandidates);
  const tail = candidates.slice(maxCandidates);
  const maxChars = 2_000; // Bound inference cost and outbound content size.
  // A malformed/legacy Qdrant payload or extractor must never turn an
  // optional inference stage into a chat retrieval failure.
  let texts: string[];
  try {
    texts = head.map((item) => {
      const text = getText(item);
      return typeof text === "string" ? text.slice(0, maxChars) : "";
    });
  } catch {
    return fallback;
  }
  if (texts.some((text) => !text.trim())) return fallback;

  try {
    const apiKey = process.env.RAG_RERANK_API_KEY?.trim();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: "Bearer " + apiKey } : {}),
      },
      body: JSON.stringify({
        query: query.slice(0, 2_000),
        texts,
        truncate: true,
        raw_scores: false,
        return_text: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
      // Never forward KB excerpts to a Location chosen by the endpoint.
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return fallback;
    // TEI returns [{ index, score }]; accept an envelope for proxy compatibility.
    const data: unknown = await response.json();
    const ranks: unknown = Array.isArray(data)
      ? data
      : data && typeof data === "object" && "ranks" in data
        ? (data as { ranks: unknown }).ranks
        : null;
    if (!Array.isArray(ranks) || ranks.length !== head.length) return fallback;
    const scores = new Map<number, number>();
    for (const rank of ranks) {
      if (!rank || typeof rank !== "object") return fallback;
      const { index, score } = rank as { index?: unknown; score?: unknown };
      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= head.length ||
        typeof score !== "number" ||
        !Number.isFinite(score) ||
        scores.has(index)
      ) return fallback;
      scores.set(index, score);
    }
    // Every input must have exactly one valid score. Stable tie-break uses
    // original vector rank; keep Qdrant scores unchanged for citations.
    const scoredHead = head
      .map((candidate, index) => ({ candidate, index, score: scores.get(index)! }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ candidate, score }) => ({ ...candidate, rerankScore: score }));
    return [...scoredHead, ...tail];
  } catch {
    // Timeouts, connection errors or invalid responses do not break chat/voice.
    return fallback;
  }
}
