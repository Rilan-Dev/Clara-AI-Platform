/**
 * src/modules/embed/core/search.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around Qdrant search used by public embed endpoints.
 * Keeps embed routes clean — no direct Qdrant imports needed there.
 */

import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";

const SCORE_THRESHOLD = 0.25;

export type EmbedSearchResult = {
  id: string;
  title: string;
  snippet: string;
  score: number;
  documentId?: string;
};

export async function searchKbEmbedded(
  collectionName: string,
  query: string,
  topK = 6
): Promise<EmbedSearchResult[]> {
  const client = getQdrantClient();
  const embedding = await ProviderFactory.getProvider().embedText(query);

  const searchParams = {
    vector: embedding,
    limit: topK,
    with_payload: true,
    score_threshold: SCORE_THRESHOLD,
  };

  let results = await client.search(collectionName, searchParams as Parameters<typeof client.search>[1]);

  // Fallback: if nothing passes threshold, retry without it
  if (!Array.isArray(results) || results.length === 0) {
    const { score_threshold: _st, ...fallback } = searchParams;
    results = await client.search(collectionName, fallback as Parameters<typeof client.search>[1]);
  }

  return (
    results as Array<{
      id: string | number;
      score?: number;
      payload?: Record<string, unknown>;
    }>
  )
    .map((r) => ({
      id: String(r.id),
      title: r.payload?.title ? String(r.payload.title) : "Document",
      snippet: r.payload?.chunk ? String(r.payload.chunk) : "",
      score: r.score ?? 0,
      documentId: r.payload?.documentId ? String(r.payload.documentId) : undefined,
    }))
    .sort((a, b) => b.score - a.score);
}
