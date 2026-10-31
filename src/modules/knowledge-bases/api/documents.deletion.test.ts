import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDocumentById: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  deleteDocumentChunks: vi.fn(),
  deleteDocument: vi.fn(),
  writeAuditLog: vi.fn(),
  query: vi.fn(),
  invalidateGraphSnapshot: vi.fn(),
  deleteGraphDocument: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn(async () => ({ user: { id: "user-1" } })),
  requireKbPermission: vi.fn(async () => undefined),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
}));
vi.mock("@/lib/plan-guard", () => ({
  planGuard: vi.fn(),
  planLimitResponse: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  hit: vi.fn(),
  rateLimitResponse: vi.fn(),
  UPLOAD_RATE: { limit: 10, windowMs: 60_000 },
}));
vi.mock("@/modules/ingest/virus-scan", () => ({
  scanUpload: vi.fn(),
  VirusScanUnavailableError: class VirusScanUnavailableError extends Error {},
}));
vi.mock("@/modules/auth/core/db", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));
vi.mock("@/modules/knowledge-bases/core/documents-db", () => ({
  createDocument: vi.fn(),
  createIngestJob: vi.fn(),
  listDocuments: vi.fn(),
  getDocumentById: mocks.getDocumentById,
  deleteDocument: mocks.deleteDocument,
  updateDocumentStatus: vi.fn(),
  getDocumentJobStatus: vi.fn(),
}));
vi.mock("@/modules/graph/core/graph-readiness",()=>({
  invalidateGraphSnapshot:mocks.invalidateGraphSnapshot,
}));
vi.mock("@/modules/graph/core/graph-store",()=>({
  getGraphStore:()=>({deleteDocument:mocks.deleteGraphDocument}),
}));
vi.mock("@/modules/admin/core/vector-store-kb", () => ({
  deleteDocumentChunks: mocks.deleteDocumentChunks,
}));
vi.mock("@/modules/knowledge-bases/worker/ingest-worker", () => ({
  INGEST_STALE_JOB_MS: 600_000,
}));
vi.mock("@/modules/cloud-jobs/queue", () => ({
  enqueueIngestJob: vi.fn(),
}));

import { deleteDocumentHandler } from "./documents";

const request = () =>
  new NextRequest("http://localhost/api/kbs/kb-1/documents/doc-1", { method: "DELETE" });

describe("document delete integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentById.mockResolvedValue({ id: "doc-1", kbId: "kb-1", title: "policy" });
    mocks.getKnowledgeBaseById.mockResolvedValue({ id: "kb-1", qdrantCollection: "kb-collection" });
    mocks.deleteDocumentChunks.mockResolvedValue(undefined);
    mocks.deleteDocument.mockResolvedValue(undefined);
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([{ org_id: "org-1" }]);
    delete process.env.GRAPH_STORE_PROVIDER;
    mocks.invalidateGraphSnapshot.mockResolvedValue(undefined);
    mocks.deleteGraphDocument.mockResolvedValue(undefined);
  });

  it("invalidates a verified graph even when all graph feature flags are disabled",async()=>{
    const response=await deleteDocumentHandler(request(),"kb-1","doc-1");
    expect(response.status).toBe(200);
    expect(mocks.invalidateGraphSnapshot).toHaveBeenCalledWith("kb-1","kb-collection");
    expect(mocks.invalidateGraphSnapshot.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteDocumentChunks.mock.invocationCallOrder[0]);
  });
  it("cleans backfilled Neo4j evidence even when new graph indexing is disabled",async()=>{
    process.env.GRAPH_STORE_PROVIDER="neo4j";
    delete process.env.ENABLE_GRAPH_INDEXING;
    const response=await deleteDocumentHandler(request(),"kb-1","doc-1");
    expect(response.status).toBe(200);
    expect(mocks.deleteGraphDocument).toHaveBeenCalledWith("kb-1::kb-collection","doc-1");
    expect(mocks.deleteGraphDocument.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteDocumentChunks.mock.invocationCallOrder[0]);
  });
  it("keeps the document when Neo4j deletion fails, allowing a retry",async()=>{
    process.env.GRAPH_STORE_PROVIDER="neo4j";
    mocks.deleteGraphDocument.mockRejectedValueOnce(new Error("Neo4j not available"));
    const response=await deleteDocumentHandler(request(),"kb-1","doc-1");
    expect(response.status).toBe(500);
    expect(mocks.deleteDocumentChunks).not.toHaveBeenCalled();
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });
  it("does not delete the database source if Qdrant deletion fails", async () => {
    mocks.deleteDocumentChunks.mockRejectedValueOnce(new Error("Qdrant unavailable"));

    const response = await deleteDocumentHandler(request(), "kb-1", "doc-1");

    expect(response.status).toBe(500);
    expect(mocks.deleteDocumentChunks).toHaveBeenCalledWith("kb-collection", "doc-1", "kb-1");
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("does not delete the database source if its knowledge base cannot be resolved", async () => {
    mocks.getKnowledgeBaseById.mockResolvedValueOnce(null);

    const response = await deleteDocumentHandler(request(), "kb-1", "doc-1");

    expect(response.status).toBe(404);
    expect(mocks.deleteDocumentChunks).not.toHaveBeenCalled();
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it("deletes the database record only after Qdrant has confirmed deletion", async () => {
    const response = await deleteDocumentHandler(request(), "kb-1", "doc-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.deleteDocumentChunks).toHaveBeenCalledWith("kb-collection", "doc-1", "kb-1");
    expect(mocks.deleteDocument).toHaveBeenCalledOnce();
    expect(mocks.deleteDocumentChunks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteDocument.mock.invocationCallOrder[0],
    );
  });
});
