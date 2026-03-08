import { ProviderFactory } from "@/modules/ai-core/factory";
import { getQdrantClient } from "./vector-store";

// ── P8 + P9 FIX ───────────────────────────────────────────────────────────────
//
// P8: Old code fetched topK * 2 results then sliced to topK. Since sparse search
//     is not yet implemented, RRF receives only a single source list — making it
//     a pure rank passthrough that produces identical ordering to the original
//     cosine scores. Fetching the extra results was pure wasted Qdrant I/O.
//
//     Fix: fetch exactly topK from Qdrant. The RRF data structure is preserved
//     so adding sparse vectors later (BM25 / SPLADE) requires only adding the
//     sparse-search results into the same fusedResults map.
//
// P9: No score_threshold was applied, so low-relevance chunks were returned and
//     injected into the model's context. Qdrant's cosine scores below ~0.25 are
//     typically noise matches on unrelated text.
//
//     Fix: apply score_threshold: 0.25 as a first pass. If it returns 0 hits
//     (e.g. a very short document or an unusual query), fall back to a threshold-
//     free search so the model always receives something to work with.
//
// Score note: originalScore (cosine similarity) is used when there is only one
// source list, since RRF's 1/(k+rank) formula just maps rank to a different
// scale without adding information. When sparse results are added, replace the
// score field with rrfScore to combine both lists properly.

const SCORE_THRESHOLD = 0.25;

export async function searchHybrid(
  collectionName: string,
  query: string,
  topK = 4
) {
  const client = getQdrantClient();
  const provider = ProviderFactory.getProvider();

  // 1. Dense (semantic) embedding.
  const denseEmbedding = await provider.embedText(query);

  // 2. Dense vector search — fetch exactly topK (P8 fix).
  //    First attempt with score threshold (P9 fix); retry without if no hits.
  let denseResults = await client.search(collectionName, {
    vector: denseEmbedding,
    limit: topK,
    with_payload: true,
    score_threshold: SCORE_THRESHOLD,
  });

  if (!Array.isArray(denseResults) || denseResults.length === 0) {
    denseResults = await client.search(collectionName, {
      vector: denseEmbedding,
      limit: topK,
      with_payload: true,
    });
  }

  // 3. RRF fusion map — structured for multi-source fusion when sparse is added.
  //
  //    With a single source list the RRF score (1/(k+rank)) carries no more
  //    information than the original rank, so we expose originalScore as the
  //    primary sort key. When sparse results are merged here, switch the sort
  //    key to rrfScore (the sum of RRF scores across all lists).
  type FusedResult = {
    id: string | number;
    rrfScore: number;
    originalScore: number;
    payload?: Record<string, unknown>;
  };

  const RRF_K = 60; // Standard RRF constant
  const fusedResults = new Map<string, FusedResult>();

  denseResults.forEach((result, index) => {
    const id = String(result.id);
    const rank = index + 1;
    const existing = fusedResults.get(id);
    fusedResults.set(id, {
      id,
      rrfScore: (existing?.rrfScore ?? 0) + 1 / (RRF_K + rank),
      originalScore: result.score ?? 0,
      payload: (result.payload as Record<string, unknown>) ?? undefined,
    });
  });

  // TODO: Add sparse (BM25 / SPLADE) search here and merge into fusedResults
  // when Qdrant sparse vectors are configured on the collection.
  // Example structure:
  //   sparseResults.forEach((result, index) => {
  //     const id = String(result.id);
  //     const rank = index + 1;
  //     const existing = fusedResults.get(id) ?? { id, rrfScore: 0, originalScore: 0 };
  //     fusedResults.set(id, { ...existing, rrfScore: existing.rrfScore + 1 / (RRF_K + rank) });
  //   });

  // 4. Sort by originalScore (single-source) and take topK.
  //    Switch to rrfScore when sparse results are added.
  const finalResults = Array.from(fusedResults.values())
    .sort((a, b) => b.originalScore - a.originalScore)
    .slice(0, topK);

  return finalResults.map((result) => {
    const payload = result.payload ?? {};
    return {
      id: String(result.id),
      title: (payload.title as string) ?? "Untitled",
      snippet: (payload.chunk as string) ?? "",
      url: (payload.url as string | undefined) ?? undefined,
      score: result.originalScore,
      payload,
    };
  });
}
