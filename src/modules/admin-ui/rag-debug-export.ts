import type { ChunkDebugSource } from "./api";

export type DebugExportFormat = "json" | "txt";

/**
 * Shareable, allow-listed representation of the points currently stored in
 * Qdrant. This is not a vector backup: vector floats and credentials are
 * never obtained by the underlying document-chunks endpoint.
 */
export function buildChunkDebugExport(
  snapshot: ChunkDebugSource,
  options: { includeText: boolean; exportedAt?: string },
) {
  const chunks = [...snapshot.chunks]
    .sort((a, b) => a.chunkIndex - b.chunkIndex || a.pointId.localeCompare(b.pointId));
  const indices = new Set<number>();
  const duplicateIndices: number[] = [];
  const byPage: Record<string, number> = {};
  let missingPage = 0;
  let empty = 0;
  let totalCharacters = 0;

  const rows = chunks.map((chunk) => {
    if (indices.has(chunk.chunkIndex)) duplicateIndices.push(chunk.chunkIndex);
    indices.add(chunk.chunkIndex);
    if (typeof chunk.pageNumber === "number" && Number.isSafeInteger(chunk.pageNumber) && chunk.pageNumber > 0) {
      const key = String(chunk.pageNumber);
      byPage[key] = (byPage[key] ?? 0) + 1;
    } else {
      missingPage++;
    }
    if (!chunk.chunk.trim()) empty++;
    totalCharacters += chunk.chunk.length;
    return {
      pointId: chunk.pointId,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber ?? null,
      title: chunk.title,
      originalFilename: chunk.originalFilename,
      uploadedAt: chunk.uploadedAt,
      characterCount: chunk.chunk.length,
      ...(options.includeText ? { text: chunk.chunk } : {}),
    };
  });

  return {
    schemaVersion: "clara.rag-chunk-export.v1",
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    source: "Authorized Clara document chunk API (live Qdrant payload)",
    vectorsIncluded: false,
    containsOriginalText: options.includeText,
    kbId: snapshot.kbId,
    documentId: snapshot.documentId,
    document: snapshot.document,
    collection: snapshot.collection,
    embedding: snapshot.embedding,
    summary: {
      reportedChunkCount: snapshot.document.reportedChunkCount,
      retrievedChunkCount: rows.length,
      countMatches: snapshot.document.reportedChunkCount == null
        ? null : snapshot.document.reportedChunkCount === rows.length,
      totalChunkCharacters: totalCharacters,
      emptyChunks: empty,
      chunksMissingSourcePage: missingPage,
      chunksByPage: byPage,
      duplicateChunkIndices: [...new Set(duplicateIndices)].sort((a, b) => a - b),
    },
    chunks: rows,
  };
}

export function formatChunkDebugExport(
  snapshot: ChunkDebugSource,
  format: DebugExportFormat,
  includeText: boolean,
  exportedAt?: string,
): string {
  const data = buildChunkDebugExport(snapshot, { includeText, exportedAt });
  if (format === "json") return JSON.stringify(data, null, 2) + "\n";

  const header = [
    "Clara AI / Qdrant document chunk diagnostic export",
    `Exported: ${data.exportedAt}`,
    `KB: ${data.kbId}`,
    `Document: ${data.documentId} (${data.document.originalFilename})`,
    `Collection: ${data.collection}`,
    `Embedding: ${data.embedding ? `${data.embedding.provider}/${data.embedding.model} (${data.embedding.dimension}D)` : "unknown"}`,
    `Retrieved: ${data.summary.retrievedChunkCount}, reported: ${data.summary.reportedChunkCount ?? "unknown"}`,
    `Text included: ${includeText ? "yes" : "no"}; Numeric vectors: never`,
  ];
  return header.join("\n") + "\n\n" + data.chunks.map((chunk) =>
    [
      `#${chunk.chunkIndex + 1} | Qdrant point: ${chunk.pointId} | page: ${chunk.pageNumber ?? "unknown"} | chars: ${chunk.characterCount}`,
      ...(includeText && "text" in chunk ? [chunk.text] : []),
    ].join("\n")
  ).join("\n\n---\n\n") + "\n";
}
