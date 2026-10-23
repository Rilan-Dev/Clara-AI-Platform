import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rawProviderError =
  'Embedding failed (gemini/gemini-embedding-001 @ generativelanguage.googleapis.com): ' +
  '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","retryDelay":"63499s"}}';

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  listDocuments: vi.fn(),
  getDocumentById: vi.fn(),
  getDocumentJobStatus: vi.fn(),
  enqueueIngestJob: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/knowledge-bases/core/documents-db", () => ({
  listDocuments: mocks.listDocuments,
  getDocumentById: mocks.getDocumentById,
  getDocumentJobStatus: mocks.getDocumentJobStatus,
}));
vi.mock("@/modules/knowledge-bases/worker/ingest-worker", () => ({ INGEST_STALE_JOB_MS: 600_000 }));
vi.mock("@/modules/cloud-jobs/queue", () => ({ enqueueIngestJob: mocks.enqueueIngestJob }));

import {
  listDocumentsHandler,
  getDocumentHandler,
  reprocessDocumentHandler,
} from "./documents";

const request = () => new NextRequest("http://localhost/api/kbs/kb-1/documents");
const document = () => ({
  id: "doc-1", kbId: "kb-1", title: "Policy", status: "failed",
  errorMessage: rawProviderError, chunkCount: 264,
});

describe("KB document API provider diagnostic redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "org-user" } });
    mocks.requireKbPermission.mockResolvedValue({ orgId: "org-1" });
    mocks.listDocuments.mockResolvedValue([document(), { ...document(), id: "doc-2", status: "ready", errorMessage: null }]);
    mocks.getDocumentById.mockResolvedValue(document());
    mocks.getDocumentJobStatus.mockResolvedValue({
      id: "job-1", status: "failed", errorMessage: rawProviderError,
      startedAt: null, attempts: 1, maxAttempts: 3,
      filePayload: { base64: "PRIVATE_SOURCE_CONTENT", mimeType: "application/pdf", filename: "Policy.pdf" },
    });
    mocks.enqueueIngestJob.mockResolvedValue(undefined);
  });

  it("redacts archived raw failures from KB document listings", async () => {
    const response = await listDocumentsHandler(request(), "kb-1");
    expect(response.status).toBe(200);
    const serialized = await response.text();
    expect(serialized).not.toContain("generativelanguage.googleapis.com");
    expect(serialized).not.toContain("RESOURCE_EXHAUSTED");
    expect(serialized).not.toContain("63499s");
    const docs = JSON.parse(serialized) as Array<{ errorMessage: string | null; chunkCount: number }>;
    expect(docs[0]?.errorMessage).toContain("Retry later");
    expect(docs[0]?.chunkCount).toBe(264);
    expect(docs[1]?.errorMessage).toBeNull();
  });

  it("redacts both document and ingest job diagnostics and never returns original file bytes", async () => {
    const response = await getDocumentHandler(request(), "kb-1", "doc-1");
    expect(response.status).toBe(200);
    const serialized = await response.text();
    expect(serialized).not.toContain("gemini");
    expect(serialized).not.toContain("RESOURCE_EXHAUSTED");
    expect(serialized).not.toContain("PRIVATE_SOURCE_CONTENT");
    const body = JSON.parse(serialized);
    expect(body.errorMessage).toContain("Retry later");
    expect(body.job.errorMessage).toContain("Retry later");
    expect(body.job.filePayload).toBeUndefined();
  });

  it("does not echo the previous provider failure when requeuing an existing pending retry", async () => {
    mocks.getDocumentJobStatus.mockResolvedValueOnce({
      id: "job-1", status: "pending", errorMessage: rawProviderError,
      startedAt: null, attempts: 1, maxAttempts: 3,
      filePayload: { base64: "PRIVATE_SOURCE_CONTENT", filename: "Policy.pdf", mimeType: "application/pdf" },
    });
    const response = await reprocessDocumentHandler(request(), "kb-1", "doc-1");
    expect(response.status).toBe(200);
    const serialized = await response.text();
    expect(serialized).not.toContain("generativelanguage");
    expect(serialized).not.toContain("PRIVATE_SOURCE_CONTENT");
    const body = JSON.parse(serialized);
    expect(body.document.status).toBe("pending");
    expect(body.document.errorMessage).toBeNull();
    expect(mocks.enqueueIngestJob).toHaveBeenCalledWith("job-1");
  });

  it("redacts internal errors thrown by the document list query", async () => {
    mocks.listDocuments.mockRejectedValueOnce(
      new Error("postgres://private:password@db.local:5432/tenant"),
    );
    const response = await listDocumentsHandler(request(), "kb-1");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).toContain("document request could not be completed");
    expect(text).not.toContain("password");
    expect(text).not.toContain("db.local");
  });

  it("redacts internal errors from single-document status polling", async () => {
    mocks.getDocumentJobStatus.mockRejectedValueOnce(
      new Error("Google API 429 RESOURCE_EXHAUSTED https://secret.provider.internal"),
    );
    const response = await getDocumentHandler(request(), "kb-1", "doc-1");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("RESOURCE_EXHAUSTED");
    expect(text).not.toContain("secret.provider");
  });

  it("retains document/KB ownership checks before returning diagnostic status", async () => {
    mocks.getDocumentById.mockResolvedValueOnce({ ...document(), kbId: "kb-other" });
    const response = await getDocumentHandler(request(), "kb-1", "doc-1");
    expect(response.status).toBe(404);
    expect(mocks.getDocumentJobStatus).not.toHaveBeenCalled();
  });
});
