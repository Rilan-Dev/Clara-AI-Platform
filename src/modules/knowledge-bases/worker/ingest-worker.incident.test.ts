import { beforeEach, describe, expect, it, vi } from "vitest";

const providerFailure = new Error(
  'Embedding failed (gemini/gemini-embedding-001 @ generativelanguage.googleapis.com): ' +
  '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","retryDelay":"21s"}}',
);

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  recordEmbeddingRuntimeFailure: vi.fn(),
  parseDocumentFromBuffer: vi.fn(),
  chunkText: vi.fn(),
  upsertDocumentsKb: vi.fn(),
  indexDocumentGraph:vi.fn(),
  invalidateGraphSnapshot:vi.fn(),
  reconcileGraphSnapshotAfterIngest:vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  claimPendingJobById: vi.fn(),
  updateDocumentStatus: vi.fn(),
  markJobDone: vi.fn(),
  markJobFailed: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/graph/core/graph-readiness",()=>({invalidateGraphSnapshot:mocks.invalidateGraphSnapshot}));
vi.mock("@/modules/graph/core/graph-snapshot-reconcile",()=>({
  reconcileGraphSnapshotAfterIngest:mocks.reconcileGraphSnapshotAfterIngest,
}));
vi.mock("@/modules/graph/core/graph-indexing",()=>({
  indexDocumentGraph:mocks.indexDocumentGraph,
  graphIndexingEnabledForKb:(kbId:string)=>process.env.ENABLE_GRAPH_INDEXING==="true" &&
    (!process.env.GRAPH_INDEXING_KB_ID || process.env.GRAPH_INDEXING_KB_ID===kbId),
}));
vi.mock("@/modules/platform-health/core/incidents", () => ({
  recordEmbeddingRuntimeFailure: mocks.recordEmbeddingRuntimeFailure,
}));
vi.mock("@/modules/admin/core/ingest/document-loader", () => ({
  parseDocumentFromBuffer: mocks.parseDocumentFromBuffer,
}));
vi.mock("@/modules/admin/core/ingest/chunker", () => ({ chunkText: mocks.chunkText }));
vi.mock("@/modules/admin/core/vector-store-kb", () => ({
  upsertDocumentsKb: mocks.upsertDocumentsKb,
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
}));
vi.mock("@/modules/knowledge-bases/core/documents-db", () => ({
  claimPendingJobById: mocks.claimPendingJobById,
  claimNextPendingJob: vi.fn(),
  resetStaleIngestJobs: vi.fn(),
  failOrphanedProcessingDocuments: vi.fn(),
  finalizeUnclaimableIngestJobs: vi.fn(),
  updateDocumentStatus: mocks.updateDocumentStatus,
  markJobDone: mocks.markJobDone,
  markJobFailed: mocks.markJobFailed,
}));

import { processJobById } from "./ingest-worker";

describe("platform-admin incidents for failed embedding ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_GRAPH_INDEXING;
    delete process.env.GRAPH_INDEXING_KB_ID;
    mocks.reconcileGraphSnapshotAfterIngest.mockResolvedValue({verified:true,reason:"verified",
      sourceChunks:1,graphDocuments:1});
    mocks.invalidateGraphSnapshot.mockResolvedValue(undefined);
    mocks.indexDocumentGraph.mockResolvedValue({state:"indexed",nodes:2,edges:1});
    mocks.upsertDocumentsKb.mockResolvedValue(undefined);
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.getKnowledgeBaseById.mockResolvedValue({
      id: "kb-1", qdrantCollection: "kb_vectors",
    });
    mocks.claimPendingJobById.mockResolvedValue({
      id: "job-1", documentId: "doc-1", kbId: "kb-1", attempts: 1,
      filePayload: {
        base64: Buffer.from("a valid PDF").toString("base64"),
        mimeType: "application/pdf", filename: "policy.pdf",
      },
    });
    mocks.parseDocumentFromBuffer.mockResolvedValue({ text: "Document text", title: "Policy" });
    mocks.chunkText.mockReturnValue(["a chunk"]);
    mocks.updateDocumentStatus.mockResolvedValue(undefined);
    mocks.markJobDone.mockResolvedValue(undefined);
    mocks.markJobFailed.mockResolvedValue(undefined);
    mocks.recordEmbeddingRuntimeFailure.mockResolvedValue(undefined);
  });

  it("invalidates a previously verified graph before writing new vectors, even with graph flags off",async()=>{
    const result=await processJobById("job-1");
    expect(result).toMatchObject({status:"processed",chunkCount:1});
    expect(mocks.invalidateGraphSnapshot).toHaveBeenCalledWith("kb-1","kb_vectors");
    expect(mocks.invalidateGraphSnapshot.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.upsertDocumentsKb.mock.invocationCallOrder[0]);
    expect(mocks.indexDocumentGraph).not.toHaveBeenCalled();
  });
  it("keeps other tenants vector-only while scoped graph ingestion is enabled",async()=>{
    process.env.ENABLE_GRAPH_INDEXING="true";
    process.env.GRAPH_INDEXING_KB_ID="different-kb";
    const result=await processJobById("job-1");
    expect(result.status).toBe("processed");
    expect(mocks.upsertDocumentsKb).toHaveBeenCalledOnce();
    expect(mocks.indexDocumentGraph).not.toHaveBeenCalled();
  });
  it("verifies the exact KB graph after a successful graph upload",async()=>{
    process.env.ENABLE_GRAPH_INDEXING="true";
    process.env.GRAPH_INDEXING_KB_ID="kb-1";
    const result=await processJobById("job-1");
    expect(result.status).toBe("processed");
    expect(mocks.reconcileGraphSnapshotAfterIngest).toHaveBeenCalledWith("kb-1","kb_vectors");
    expect(mocks.indexDocumentGraph.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.reconcileGraphSnapshotAfterIngest.mock.invocationCallOrder[0]);
  });
  it("retains successful vector and graph ingestion if concurrent verification is deferred",async()=>{
    process.env.ENABLE_GRAPH_INDEXING="true";
    process.env.GRAPH_INDEXING_KB_ID="kb-1";
    mocks.reconcileGraphSnapshotAfterIngest.mockRejectedValueOnce(new Error("source changed"));
    const result=await processJobById("job-1");
    expect(result.status).toBe("processed");
    expect(mocks.markJobDone).toHaveBeenCalledWith("job-1");
  });
  it("automatically creates graph evidence AFTER successful Qdrant upload when opted in",async()=>{
    process.env.ENABLE_GRAPH_INDEXING="true";
    const result=await processJobById("job-1");
    expect(result.status).toBe("processed");
    expect(mocks.indexDocumentGraph).toHaveBeenCalledWith(expect.objectContaining({
      kbId:"kb-1",collection:"kb_vectors",documentId:"doc-1",chunks:["a chunk"],
    }));
    expect(mocks.upsertDocumentsKb.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.indexDocumentGraph.mock.invocationCallOrder[0]);
  });
  it("does not destroy healthy Qdrant ingestion when optional Neo4j extraction fails",async()=>{
    process.env.ENABLE_GRAPH_INDEXING="true";
    mocks.indexDocumentGraph.mockRejectedValueOnce(new Error("Neo4j temporarily unavailable"));
    const result=await processJobById("job-1");
    expect(result).toMatchObject({status:"processed",chunkCount:1});
    expect(mocks.updateDocumentStatus).toHaveBeenCalledWith("doc-1","ready",expect.anything());
    expect(mocks.markJobDone).toHaveBeenCalledWith("job-1");
  });
  it("stores provider diagnostics for platform operations and triggers the admin incident channel", async () => {
    mocks.upsertDocumentsKb.mockRejectedValueOnce(providerFailure);
    const result = await processJobById("job-1");
    expect(result.status).toBe("error");
    expect(mocks.updateDocumentStatus).toHaveBeenCalledWith(
      "doc-1", "failed",
      expect.objectContaining({ errorMessage: providerFailure.message, chunkCount: 1 }),
    );
    expect(mocks.markJobFailed).toHaveBeenCalledWith(
      "job-1", providerFailure.message, expect.any(Number),
    );
    expect(mocks.recordEmbeddingRuntimeFailure).toHaveBeenCalledWith(
      providerFailure, { surface: "knowledge base document ingestion" },
    );
  });

  it("does not create a platform embedding incident for a PDF with no extractable text", async () => {
    mocks.parseDocumentFromBuffer.mockResolvedValueOnce({ text: " ", title: "Empty" });
    const result = await processJobById("job-1");
    expect(result.status).toBe("error");
    expect(mocks.recordEmbeddingRuntimeFailure).not.toHaveBeenCalled();
  });
});
