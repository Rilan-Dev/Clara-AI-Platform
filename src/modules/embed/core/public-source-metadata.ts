/**
 * Public chat source metadata should retain verified source-page provenance,
 * without disclosing document IDs, tenant identifiers or raw Qdrant payloads.
 * A legacy point without page provenance must not acquire a guessed page.
 */
export function toPublicSourceMetadata(
  result: {
    title: string;
    snippet: string;
    score: number;
    pageNumber?: number;
  },
  index: number,
): {
  index: number;
  title: string;
  snippet: string;
  score: number;
  pageNumber?: number;
} {
  return {
    index: index + 1,
    title: result.title,
    snippet: result.snippet.slice(0, 200),
    score: result.score,
    ...(typeof result.pageNumber === "number" &&
      Number.isSafeInteger(result.pageNumber) && result.pageNumber > 0
      ? { pageNumber: result.pageNumber } : {}),
  };
}
