import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  query: vi.fn(),
  hit: vi.fn(),
  scanUpload: vi.fn(),
  createDocument: vi.fn(),
  createIngestJob: vi.fn(),
  enqueueIngestJob: vi.fn(),
  writeAuditLog: vi.fn(),
}));
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/rate-limit", () => ({
  hit: mocks.hit,
  UPLOAD_RATE: { limit: 10, windowMs: 60_000 },
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/modules/ingest/virus-scan", () => ({
  scanUpload: mocks.scanUpload,
  VirusScanUnavailableError: class VirusScanUnavailableError extends Error {},
}));
vi.mock("@/modules/auth/core/db", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/modules/knowledge-bases/core/documents-db", () => ({
  createDocument: mocks.createDocument,
  createIngestJob: mocks.createIngestJob,
}));
vi.mock("@/modules/cloud-jobs/queue", () => ({ enqueueIngestJob: mocks.enqueueIngestJob }));
vi.mock("@/modules/knowledge-bases/worker/ingest-worker", () => ({ INGEST_STALE_JOB_MS: 600_000 }));

import { uploadDocumentsHandler } from "./documents";
import { VirusScanUnavailableError } from "@/modules/ingest/virus-scan";

const endpoint = "https://clara.example.test/api/kbs/kb-1/documents";
const request = () => {
  const data = new FormData();
  data.append("files", new File(["some document text"], "policy.txt", { type: "text/plain" }));
  return new NextRequest(endpoint, { method: "POST", body: data });
};

describe("document upload never exposes backend failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "member-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.getKnowledgeBaseById.mockResolvedValue({ id: "kb-1", status: "active" });
    mocks.query.mockResolvedValue([]);
    mocks.hit.mockReturnValue({ allowed: true });
    mocks.scanUpload.mockResolvedValue({ clean: true });
    mocks.createDocument.mockResolvedValue({ id: "doc-1", fileSize: 18 });
    mocks.createIngestJob.mockResolvedValue({ id: "job-1" });
    mocks.enqueueIngestJob.mockResolvedValue(undefined);
    mocks.writeAuditLog.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("redacts a per-file storage failure from both errors[] and top-level error", async () => {
    const internal = new Error("INSERT documents failed at postgres://svc:SECRET@db.lan");
    mocks.createDocument.mockRejectedValueOnce(internal);
    const response = await uploadDocumentsHandler(request(), "kb-1");
    expect(response.status).toBe(400);
    const serialized = await response.text();
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("postgres://");
    const body = JSON.parse(serialized);
    expect(body.code).toBe("UPLOAD_FAILED");
    expect(body.errors[0].code).toBe("UPLOAD_FAILED");
    expect(body.errors[0].error).toContain("Please retry");
    expect(console.error).toHaveBeenCalledWith("[documents] upload file:", internal);
    expect(mocks.enqueueIngestJob).not.toHaveBeenCalled();
  });

  it("redacts unavailable virus-scan provider details but preserves explicit 503 code", async () => {
    mocks.scanUpload.mockRejectedValueOnce(
      new VirusScanUnavailableError("AV API failed: token=PRIVATE at antivirus.lan"),
    );
    const response = await uploadDocumentsHandler(request(), "kb-1");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("VIRUS_SCAN_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
    expect(JSON.stringify(body)).not.toContain("antivirus.lan");
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("never echoes database diagnostics in an unexpected top-level 500", async () => {
    mocks.query.mockRejectedValueOnce(new Error("SELECT org_id failed at db.lan:5432 /private"));
    const response = await uploadDocumentsHandler(request(), "kb-1");
    expect(response.status).toBe(500);
    const serialized = await response.text();
    expect(serialized).toContain("document request could not be completed");
    expect(serialized).not.toContain("db.lan");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("preserves permission denial before parsing an uploaded file", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await uploadDocumentsHandler(request(), "kb-1");
    expect(response.status).toBe(403);
    expect(mocks.scanUpload).not.toHaveBeenCalled();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });
});
