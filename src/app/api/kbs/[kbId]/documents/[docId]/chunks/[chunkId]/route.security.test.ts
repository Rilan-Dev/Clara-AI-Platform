import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  getDocumentById: vi.fn(),
  retrieve: vi.fn(),
  updateChunk: vi.fn(),
  deleteChunk: vi.fn(),
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
vi.mock("@/modules/admin/core/vector-store", () => ({
  getQdrantClient: () => ({ retrieve: mocks.retrieve }),
}));
vi.mock("@/modules/admin/core/vector-store-kb", () => ({
  updateChunk: mocks.updateChunk,
  deleteChunk: mocks.deleteChunk,
}));

import { PATCH, DELETE } from "./route";

const params = {
  params: Promise.resolve({ kbId: "kb-owned", docId: "doc-owned", chunkId: "point-id" }),
};

const request = (method: "PATCH" | "DELETE", body?: unknown) =>
  new NextRequest("http://localhost/api/kbs/kb-owned/documents/doc-owned/chunks/point-id", {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  });

describe("document-chunk mutation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.getKnowledgeBaseById.mockResolvedValue({
      id: "kb-owned",
      qdrantCollection: "kb-shared-collection",
    });
    mocks.getDocumentById.mockResolvedValue({
      id: "doc-owned",
      kbId: "kb-owned",
      title: "Owned document",
      originalFilename: "owned.pdf",
    });
    mocks.retrieve.mockResolvedValue([{
      id: "point-id",
      payload: { kbId: "kb-owned", documentId: "doc-owned", chunkIndex: 17 },
    }]);
    mocks.updateChunk.mockResolvedValue(undefined);
    mocks.deleteChunk.mockResolvedValue(undefined);
  });

  it("blocks editing a point belonging to another document in the same KB", async () => {
    mocks.retrieve.mockResolvedValueOnce([{
      id: "point-id",
      payload: { kbId: "kb-owned", documentId: "doc-other", chunkIndex: 4 },
    }]);
    const response = await PATCH(request("PATCH", { text: "Tampered" }), params);

    expect(response.status).toBe(404);
    expect(mocks.updateChunk).not.toHaveBeenCalled();
    expect(mocks.retrieve).toHaveBeenCalledWith("kb-shared-collection", {
      ids: ["point-id"],
      with_payload: true,
      with_vector: false,
    });
  });

  it("blocks deleting a point belonging to another document", async () => {
    mocks.retrieve.mockResolvedValueOnce([{
      id: "point-id",
      payload: { kbId: "kb-owned", documentId: "doc-other", chunkIndex: 0 },
    }]);
    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(404);
    expect(mocks.deleteChunk).not.toHaveBeenCalled();
  });

  it("does not trust a point with a different KB id or missing ownership", async () => {
    mocks.retrieve.mockResolvedValueOnce([{
      id: "point-id",
      payload: { kbId: "kb-foreign", documentId: "doc-owned", chunkIndex: 2 },
    }]);
    const response = await PATCH(request("PATCH", { text: "Tampered" }), params);

    expect(response.status).toBe(404);
    expect(mocks.updateChunk).not.toHaveBeenCalled();
  });

  it("does not create new points when a supplied point id is missing", async () => {
    mocks.retrieve.mockResolvedValueOnce([]);
    const response = await PATCH(request("PATCH", { text: "New fake point" }), params);

    expect(response.status).toBe(404);
    expect(mocks.updateChunk).not.toHaveBeenCalled();
  });

  it("preserves the original chunk index when the patch omits it", async () => {
    const response = await PATCH(request("PATCH", { text: " Updated content " }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pointId: "point-id",
      text: "Updated content",
      chunkIndex: 17,
    });
    expect(mocks.updateChunk).toHaveBeenCalledWith(
      "kb-shared-collection",
      "point-id",
      "Updated content",
      17,
      {
        kbId: "kb-owned",
        documentId: "doc-owned",
        title: "Owned document",
        originalFilename: "owned.pdf",
      },
    );
  });

  it("rejects a non-integral or negative new chunk index", async () => {
    for (const chunkIndex of [-1, 0.5, "5", null]) {
      const response = await PATCH(request("PATCH", { text: "content", chunkIndex }), params);
      expect(response.status).toBe(400);
    }
    expect(mocks.updateChunk).not.toHaveBeenCalled();
  });

  it("fails closed on invalid stored chunk-index metadata during update", async () => {
    mocks.retrieve.mockResolvedValueOnce([{
      id: "point-id",
      payload: { kbId: "kb-owned", documentId: "doc-owned", chunkIndex: "invalid" },
    }]);
    const response = await PATCH(request("PATCH", { text: "content" }), params);

    expect(response.status).toBe(409);
    expect(mocks.updateChunk).not.toHaveBeenCalled();
  });

  it("preserves valid deletion of a point owned by the document", async () => {
    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(200);
    expect(mocks.deleteChunk).toHaveBeenCalledWith("kb-shared-collection", "point-id", "kb-owned");
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(),
      "kb-owned",
      "document:delete",
    );
  });

  it("rejects lack of mutation permissions before even fetching the point", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(403);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.deleteChunk).not.toHaveBeenCalled();
  });
});
