/**
 * src/modules/embed/core/search.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around Qdrant search used by public embed endpoints.
 * Keeps embed routes clean — no direct Qdrant imports needed there.
 */

import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ProviderConfig } from "@/modules/ai-core/types";

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
  topK = 6,
  options?: {
    providerConfig?: ProviderConfig;
    filter?: Record<string, unknown>;
  },
): Promise<EmbedSearchResult[]> {
  const client = getQdrantClient();
  const embedding = await ProviderFactory.getProvider(options?.providerConfig).embedText(query);

  const searchParams = {
    vector: embedding,
    limit: topK,
    with_payload: true,
    score_threshold: SCORE_THRESHOLD,
    ...(options?.filter ? { filter: options.filter } : {}),
  };

  let results = await client.search(collectionName, searchParams as Parameters<typeof client.search>[1]);

  // Fallback: if nothing passes threshold, retry without it
  if (!Array.isArray(results) || results.length === 0) {
    const fallback: Record<string, unknown> = { ...searchParams };
    delete fallback.score_threshold;
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
