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
  getKnowledgeBaseById: vi.fn(),
  claimPendingJobById: vi.fn(),
  updateDocumentStatus: vi.fn(),
  markJobDone: vi.fn(),
  markJobFailed: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
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
