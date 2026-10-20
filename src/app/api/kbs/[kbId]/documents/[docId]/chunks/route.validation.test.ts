import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  getDocumentById: vi.fn(),
  listDocumentChunks: vi.fn(),
  addChunk: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
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
  addChunk: mocks.addChunk,
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ kbId: "kb-1", docId: "doc-1" }) };
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/kbs/kb-1/documents/doc-1/chunks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("KB chunk creation input integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.getKnowledgeBaseById.mockResolvedValue({
      id: "kb-1",
      status: "active",
      qdrantCollection: "kb-collection",
    });
    mocks.getDocumentById.mockResolvedValue({
      id: "doc-1",
      kbId: "kb-1",
      title: "Source document",
      originalFilename: "original.pdf",
    });
    mocks.listDocumentChunks.mockResolvedValue([{ chunkIndex: 6 }, { chunkIndex: 3 }]);
    mocks.addChunk.mockResolvedValue("point-created");
  });

  it("prevents chunk creation in an archived KB", async () => {
    mocks.getKnowledgeBaseById.mockResolvedValueOnce({
      id: "kb-1",
      status: "archived",
      qdrantCollection: "kb-collection",
    });

    const response = await POST(request({ text: "New information" }), params);

    expect(response.status).toBe(400);
    expect(mocks.listDocumentChunks).not.toHaveBeenCalled();
    expect(mocks.addChunk).not.toHaveBeenCalled();
  });

  it("rejects malformed chunk indices without reading or writing existing vectors", async () => {
    for (const chunkIndex of [-1, 1.5, "5", null]) {
      const response = await POST(request({ text: "valid text", chunkIndex }), params);
      expect(response.status).toBe(400);
    }
    expect(mocks.listDocumentChunks).not.toHaveBeenCalled();
    expect(mocks.addChunk).not.toHaveBeenCalled();
  });

  it("rejects non-string text instead of converting arbitrary JSON into chunks", async () => {
    const response = await POST(request({ text: { invalid: true }, chunkIndex: 0 }), params);

    expect(response.status).toBe(400);
    expect(mocks.addChunk).not.toHaveBeenCalled();
  });

  it("keeps automatic next chunk index when an index is not supplied", async () => {
    const response = await POST(request({ text: "  appended context  " }), params);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      pointId: "point-created",
      chunkIndex: 7,
      text: "appended context",
    });
    expect(mocks.addChunk).toHaveBeenCalledWith(
      "kb-collection",
      "appended context",
      7,
      {
        kbId: "kb-1",
        documentId: "doc-1",
        title: "Source document",
        originalFilename: "original.pdf",
      },
    );
  });

  it("accepts a valid explicit zero chunk index", async () => {
    const response = await POST(request({ text: "Beginning", chunkIndex: 0 }), params);

    expect(response.status).toBe(201);
    expect(mocks.addChunk).toHaveBeenCalledWith(
      "kb-collection",
      "Beginning",
      0,
      expect.objectContaining({ kbId: "kb-1", documentId: "doc-1" }),
    );
  });
});
