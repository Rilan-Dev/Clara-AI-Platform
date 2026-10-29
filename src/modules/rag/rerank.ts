/**
 * Optional second-stage, model-based RAG reranking using a self-hosted
 * Hugging Face Text Embeddings Inference (TEI) /rerank endpoint.
 *
 * Security: call only a server-operator configured endpoint, after the
 * existing tenant/KB-filtered retrieval. Never log query or source text.
 * Ranking scores are separate from Qdrant similarity/citation scores.
 */
export type Reranked<T> = T & { rerankScore?: number };

/** Content-free, per-retrieval outcome, never logged with query or KB excerpts. */
export type RerankStatus = "skipped" | "applied" | "timeout" | "fallback";
export type RerankObservation = {
  status: RerankStatus;
  /** Total optional reranking wall time, including service wait and validation. */
  ms: number;
  candidateCount: number;
};

export async function rerankCandidates<T>(
  query: string,
  candidates: readonly T[],
  getText: (candidate: T) => string,
  options: { disabled?: boolean; onObservation?: (observation: RerankObservation) => void } = {},
): Promise<Array<Reranked<T>>> {
  // `rerankScore` is an optional marker property, so every T is a valid
  // Reranked<T>; the assertion only informs the checker of that invariant.
  const fallback = [...candidates] as Array<Reranked<T>>;
  const started = Date.now();
  const observe = (status: RerankStatus) => {
    // Diagnostics are best-effort and cannot break or alter retrieved evidence.
    try {
      options.onObservation?.({ status, ms: Date.now() - started, candidateCount: candidates.length });
    } catch {
      // Ignore a consumer's instrumentation failure.
    }
  };
  const returnFallback = (status: RerankStatus): Array<Reranked<T>> => {
    observe(status);
    return fallback;
  };
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
  ) return returnFallback("skipped");

  // The URL is deployment-owned, never accepted from a user/tenant request.
  try {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") return returnFallback("skipped");
  } catch {
    return returnFallback("skipped");
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
  // Same optional-marker invariant as `fallback` above: the unscored tail
  // stays a valid Reranked<T> (diversification may still select it).
  const tail = candidates.slice(maxCandidates) as Array<Reranked<T>>;
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
    return returnFallback("skipped");
  }
  if (texts.some((text) => !text.trim())) return returnFallback("skipped");

  let signal: AbortSignal | undefined;
  try {
    const apiKey = process.env.RAG_RERANK_API_KEY?.trim();
    signal = AbortSignal.timeout(timeoutMs);
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
      signal,
      // Never forward KB excerpts to a Location chosen by the endpoint.
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return returnFallback("fallback");
    // TEI returns [{ index, score }]; accept an envelope for proxy compatibility.
    const data: unknown = await response.json();
    const ranks: unknown = Array.isArray(data)
      ? data
      : data && typeof data === "object" && "ranks" in data
        ? (data as { ranks: unknown }).ranks
        : null;
    if (!Array.isArray(ranks) || ranks.length !== head.length) return returnFallback("fallback");
    const scores = new Map<number, number>();
    for (const rank of ranks) {
      if (!rank || typeof rank !== "object") return returnFallback("fallback");
      const { index, score } = rank as { index?: unknown; score?: unknown };
      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= head.length ||
        typeof score !== "number" ||
        !Number.isFinite(score) ||
        scores.has(index)
      ) return returnFallback("fallback");
      scores.set(index, score);
    }
    // Every input must have exactly one valid score. Stable tie-break uses
    // original vector rank; keep Qdrant scores unchanged for citations.
    const scoredHead = head
      .map((candidate, index) => ({ candidate, index, score: scores.get(index)! }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ candidate, score }) => ({ ...candidate, rerankScore: score }));
    observe("applied");
    return [...scoredHead, ...tail];
  } catch {
    // A model timeout is distinct from an HTTP/validation outage. Both fail open.
    const timedOut = signal?.aborted && (signal.reason as { name?: string } | undefined)?.name === "TimeoutError";
    return returnFallback(timedOut ? "timeout" : "fallback");
  }
}
