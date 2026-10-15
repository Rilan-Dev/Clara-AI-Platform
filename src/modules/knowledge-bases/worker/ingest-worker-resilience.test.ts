/**
 * Behavior tests for the ingest worker's failure-path resilience.
 *
 * Scenario under test (seen live on Docker deployments): the embedding
 * provider is unreachable, ingest jobs fail in bulk, and the Postgres pool
 * blips under the load storm. A single lost failure-status UPDATE used to
 * orphan the job/document pair forever — job stuck 'running' (or pending
 * with exhausted attempts), document stuck 'pending' with the background
 * worker never picking it up. The fixes:
 *   • processClaimedJob retries its failure-status writes.
 *   • runIngestMaintenance runs finalizeUnclaimableIngestJobs every cycle
 *     (this is what heals already-stuck documents with zero user action).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/knowledge-bases/core/documents-db", () => ({
  claimPendingJobById: vi.fn(),
  claimNextPendingJob: vi.fn(),
  resetStaleIngestJobs: vi.fn(async () => 0),
  finalizeUnclaimableIngestJobs: vi.fn(async () => 0),
  failOrphanedProcessingDocuments: vi.fn(async () => 0),
  markJobDone: vi.fn(async () => undefined),
  markJobFailed: vi.fn(async () => undefined),
  updateDocumentStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn(async () => undefined) }));
vi.mock("@/modules/admin/core/ingest/document-loader", () => ({
  parseDocumentFromBuffer: vi.fn(async () => ({ text: "hello world", title: "t" })),
}));
vi.mock("@/modules/admin/core/ingest/chunker", () => ({ chunkText: vi.fn(() => ["a", "b"]) }));
vi.mock("@/modules/admin/core/vector-store-kb", () => ({
  upsertDocumentsKb: vi.fn(async () => undefined),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: vi.fn(async () => ({ id: "kb-1", qdrantCollection: "kb_one" })),
}));

import {
  claimPendingJobById,
  finalizeUnclaimableIngestJobs,
  markJobFailed,
  resetStaleIngestJobs,
  updateDocumentStatus,
} from "@/modules/knowledge-bases/core/documents-db";
import { upsertDocumentsKb } from "@/modules/admin/core/vector-store-kb";
import { processJobById, runIngestMaintenance } from "@/modules/knowledge-bases/worker/ingest-worker";

const claimPendingJobByIdMock = vi.mocked(claimPendingJobById);
const updateDocumentStatusMock = vi.mocked(updateDocumentStatus);
const markJobFailedMock = vi.mocked(markJobFailed);
const upsertDocumentsKbMock = vi.mocked(upsertDocumentsKb);
const resetStaleMock = vi.mocked(resetStaleIngestJobs);
const finalizeDeadMock = vi.mocked(finalizeUnclaimableIngestJobs);

const job = {
  id: "job-1",
  documentId: "doc-1",
  kbId: "kb-1",
  status: "running" as const,
  attempts: 1,
  maxAttempts: 3,
  errorMessage: null,
  scheduledAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  completedAt: null,
  createdAt: new Date().toISOString(),
  filePayload: { base64: "aGk=", mimeType: "text/plain", filename: "hi.txt" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimPendingJobById).mockResolvedValue(null);
  resetStaleMock.mockResolvedValue(0);
  finalizeDeadMock.mockResolvedValue(0);
});

describe("processClaimedJob failure-path resilience", () => {
  it("retries the document failure-status write when the DB blips once", async () => {
    claimPendingJobByIdMock.mockResolvedValue(job);
    upsertDocumentsKbMock.mockRejectedValueOnce(
      new Error("Embedding failed (gemini/gemini-embedding-2-preview @ generativelanguage.googleapis.com): fetch failed")
    );

    // Call 1 ("processing" status at job start) succeeds; call 2 (the
    // failure write) fails once (DB blip), then succeeds on retry.
    updateDocumentStatusMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockResolvedValue(undefined);
    markJobFailedMock.mockResolvedValue(undefined);

    const result = await processJobById("job-1");

    expect(result.status).toBe("error");
    // "processing" + failed-write rejected + failed-write retry = 3 calls
    expect(updateDocumentStatusMock).toHaveBeenCalledTimes(3);
    expect(markJobFailedMock).toHaveBeenCalledTimes(1);
    expect(updateDocumentStatusMock).toHaveBeenLastCalledWith("doc-1", "failed", {
      errorMessage: expect.stringContaining("Embedding failed"),
    });
  });

  it("retries the job failure-status write too, and still returns the error", async () => {
    claimPendingJobByIdMock.mockResolvedValue(job);
    upsertDocumentsKbMock.mockRejectedValueOnce(new Error("boom"));

    // "processing" write + the failure write both succeed first try.
    updateDocumentStatusMock.mockResolvedValue(undefined);
    markJobFailedMock
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockResolvedValue(undefined);

    const result = await processJobById("job-1");

    expect(result.status).toBe("error");
    // "processing" + the failure write
    expect(updateDocumentStatusMock).toHaveBeenCalledTimes(2);
    expect(markJobFailedMock).toHaveBeenCalledTimes(2);
  });
});

describe("runIngestMaintenance healing passes", () => {
  it("runs the dead-job finalizer every cycle and folds it into recoveredJobs", async () => {
    resetStaleMock.mockResolvedValue(1);
    finalizeDeadMock.mockResolvedValue(3);
    // no pending jobs to claim → idle drain
    vi.mocked(claimPendingJobById).mockResolvedValue(null);

    const stats = await runIngestMaintenance(5);

    expect(finalizeDeadMock).toHaveBeenCalledTimes(1);
    expect(stats.recoveredJobs).toBe(4); // 1 stale + 3 dead
    expect(stats.processed).toBe(0);
    expect(stats.errors).toBe(0);
  });
});
