import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  getDocumentById: vi.fn(),
  listDocumentChunks: vi.fn(),
  getCollectionEmbedding: vi.fn(),
}));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
}));
vi.mock("@/modules/knowledge-bases/core/documents-db", () => ({
  getDocumentById: mocks.getDocumentById,
}));
vi.mock("@/modules/admin/core/vector-store-kb", () => ({
  listDocumentChunks: mocks.listDocumentChunks,
  addChunk: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  getCollectionEmbedding: mocks.getCollectionEmbedding,
}));
vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn(),
}));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/kbs/kb-1/documents/doc-1/chunks");
}
const params = { params: Promise.resolve({ kbId: "kb-1", docId: "doc-1" }) };

describe("authorized chunk diagnostic export boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: "u-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.getKnowledgeBaseById.mockResolvedValue({ id: "kb-1", qdrantCollection: "collection-1" });
    mocks.getDocumentById.mockResolvedValue({
      id: "doc-1", kbId: "kb-1", title: "Document", originalFilename: "policy.pdf",
      mimeType: "application/pdf", sourceType: "upload", status: "ready", chunkCount: 1,
    });
    mocks.listDocumentChunks.mockResolvedValue([{
      pointId: "point-1", documentId: "doc-1", chunkIndex: 0,
      title: "Document", originalFilename: "policy.pdf", uploadedAt: "2026-10-29",
      pageNumber: 65, chunk: "DO.2.1 text",
    }]);
    mocks.getCollectionEmbedding.mockResolvedValue({
      index: "standard", provider: "gemini", model: "model-1", dimension: 1536,
    });
  });

  it("requires document:read before querying the KB or Qdrant", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await GET(request(), params);
    expect(res.status).toBe(403);
    expect(mocks.listDocumentChunks).not.toHaveBeenCalled();
    expect(mocks.getCollectionEmbedding).not.toHaveBeenCalled();
  });

  it("rejects foreign document IDs without revealing Qdrant content", async () => {
    mocks.getDocumentById.mockResolvedValueOnce({ id: "doc-1", kbId: "kb-other" });
    const res = await GET(request(), params);
    expect(res.status).toBe(404);
    expect(mocks.listDocumentChunks).not.toHaveBeenCalled();
  });

  it("uses the live collection, returns metadata, never exposes vectors", async () => {
    const res = await GET(request(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listDocumentChunks).toHaveBeenCalledWith("collection-1", "doc-1");
    const body = await res.json();
    expect(body.embedding).toEqual({ index: "standard", provider: "gemini", model: "model-1", dimension: 1536 });
    expect(body.chunks[0]).toMatchObject({ pointId: "point-1", pageNumber: 65, chunk: "DO.2.1 text" });
    expect(JSON.stringify(body)).not.toContain('"vector":');
  });
});
