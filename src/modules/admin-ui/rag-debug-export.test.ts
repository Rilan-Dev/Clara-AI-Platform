import { describe, expect, it } from "vitest";
import { buildChunkDebugExport, formatChunkDebugExport } from "./rag-debug-export";
import type { ChunkDebugSource } from "./api";

const snapshot: ChunkDebugSource = {
  schemaVersion: "clara.chunk-debug.v1",
  kbId: "kb-1",
  documentId: "doc-1",
  title: "Policy",
  chunkCount: 3,
  document: {
    id: "doc-1", title: "Policy", originalFilename: "arabic-policy.pdf",
    mimeType: "application/pdf", sourceType: "upload", status: "ready",
    reportedChunkCount: 3,
  },
  collection: "kb_doc_test",
  embedding: { index: "standard", provider: "gemini", model: "embedding-model", dimension: 1536 },
  chunks: [
    { pointId: "b", documentId: "doc-1", chunkIndex: 1, pageNumber: 2, title: "Policy", originalFilename: "arabic-policy.pdf", uploadedAt: "2026-10-29", chunk: "Second page" },
    { pointId: "a", documentId: "doc-1", chunkIndex: 0, pageNumber: 1, title: "Policy", originalFilename: "arabic-policy.pdf", uploadedAt: "2026-10-29", chunk: "First page" },
    { pointId: "c", documentId: "doc-1", chunkIndex: 1, title: "Policy", originalFilename: "arabic-policy.pdf", uploadedAt: "2026-10-29", chunk: "" },
  ],
};

describe("shareable authorized Qdrant chunk diagnostic", () => {
  it("exports exact point identity, text, index info and integrity warnings", () => {
    const exported = buildChunkDebugExport(snapshot, { includeText: true, exportedAt: "2026-10-29T00:00:00Z" });
    expect(exported.vectorsIncluded).toBe(false);
    expect(exported.chunks.map((chunk) => chunk.pointId)).toEqual(["a", "b", "c"]);
    expect(exported.chunks[0]).toMatchObject({ pageNumber: 1, characterCount: 10, text: "First page" });
    expect(exported.summary.duplicateChunkIndices).toEqual([1]);
    expect(exported.summary.chunksMissingSourcePage).toBe(1);
    expect(exported.summary.emptyChunks).toBe(1);
    expect(exported.summary.chunksByPage).toEqual({ "1": 1, "2": 1 });
    expect(exported.embedding?.dimension).toBe(1536);
  });

  it("can omit document text while retaining shape and point IDs", () => {
    const exported = buildChunkDebugExport(snapshot, { includeText: false });
    expect(exported.containsOriginalText).toBe(false);
    const json = JSON.stringify(exported);
    expect(json).not.toContain("First page");
    expect(json).not.toContain("Second page");
    expect(json).toContain("kb_doc_test");
    expect(json).toContain('"pointId":"a"');
  });

  it("makes shareable JSON and UTF-8 text, without vector arrays", () => {
    const json = formatChunkDebugExport(snapshot, "json", true);
    expect(JSON.parse(json).chunks).toHaveLength(3);
    expect(json).not.toContain('"vector":');
    const txt = formatChunkDebugExport(snapshot, "txt", true);
    expect(txt).toContain("Second page");
    expect(txt).toContain("page: 1");
    const redacted = formatChunkDebugExport(snapshot, "txt", false);
    expect(redacted).not.toContain("First page");
  });
});
