/**
 * Qdrant collection is the immutable published-index boundary. A Neo4j
 * graph for a live collection MUST NOT be queried as a published snapshot.
 */
export function scopedGraphKbId(kbId: string, collection: string): string {
  if (!kbId.trim() || !collection.trim()) throw Error("Graph scope requires KB and vector collection");
  return `${kbId}::${collection}`;
}
