import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sourceError =
  'Embedding failed (gemini/gemini-embedding-001 @ generativelanguage.googleapis.com): ' +
  '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","retryDelay":"21.205659348s"}}';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  queryOne: vi.fn(),
  query: vi.fn(),
  advanceReindexJob: vi.fn(),
  retryReindexJob: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
  requireOrgPermission: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ queryOne: mocks.queryOne, query: mocks.query }));
vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  getKbIndexContext: vi.fn(async () => ({ collection: "kb_current", orgId: "org-1", desiredIndex: "standard" })),
  getCollectionEmbedding: vi.fn(async () => ({
    index: "standard", provider: "gemini", model: "gemini-embedding-2-preview", dimension: 1536,
  })),
  getMultilingualAvailability: vi.fn(async () => ({
    available: false, platform: false, plan: true, reason: "Not enabled",
  })),
  isEmbeddingIndexKind: (value: string) => value === "standard" || value === "multilingual",
  targetForIndex: vi.fn(async () => ({ provider: "gemini", model: "gemini-embedding-001", dimension: 1536 })),
  toJob: vi.fn((row: Record<string, unknown>) => ({
    id: row.id,
    status: row.status,
    pointsTotal: row.points_total,
    pointsDone: row.points_done,
    targetIndex: row.target_index,
    model: row.embedding_model,
    errorMessage: row.error_message,
  })),
}));
vi.mock("@/modules/knowledge-bases/core/reindex", () => ({
  ReindexError: class ReindexError extends Error {},
  advanceReindexJob: mocks.advanceReindexJob,
  retryReindexJob: mocks.retryReindexJob,
  startReindex: vi.fn(),
  cancelReindex: vi.fn(),
  deleteRetiredIndexes: vi.fn(),
}));
vi.mock("@/modules/ai-core/multilingual-embeddings", () => ({
  getMultilingualSettings: () => ({ model: "disabled" }),
  findMultilingualModel: () => null,
}));

import { getEmbeddingIndex, postEmbeddingIndex } from "./embedding-index";

const job = {
  id: "job-1", kb_id: "kb-1", status: "failed",
  points_total: 315, points_done: 64, target_index: "standard",
  embedding_model: "gemini-embedding-001", error_message: sourceError,
};
const request = (method = "GET", body?: unknown) =>
  new NextRequest("http://localhost/api/kbs/kb-1/embedding-index", {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

describe("knowledge index status response privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: "org-user" } });
    mocks.requireKbPermission.mockResolvedValue({
      orgId: "org-1", permissions: new Set(["kb:read", "kb:update"]),
    });
    mocks.queryOne.mockImplementation(async (sql: string) =>
      sql.includes("kb_reindex_jobs") ? job : null);
    mocks.query.mockResolvedValue([{ count: 2 }]);
    mocks.retryReindexJob.mockResolvedValue({ id: "job-1" });
  });

  it("returns progress and resume state, not Google's raw 429 quota error", async () => {
    const response = await getEmbeddingIndex(request(), "kb-1");
    expect(response.status).toBe(200);
    const serialized = await response.text();
    expect(serialized).not.toContain("generativelanguage");
    expect(serialized).not.toContain("RESOURCE_EXHAUSTED");
    expect(serialized).not.toContain("21.205659348s");
    const data = JSON.parse(serialized);
    expect(data.job.status).toBe("failed");
    expect(data.job.pointsDone).toBe(64);
    expect(data.job.pointsTotal).toBe(315);
    expect(data.job.errorMessage).toContain("Resume later");
    expect(data.current.model).toBe("gemini-embedding-2-preview");
    expect(data.standardUpdate.model).toBe("gemini-embedding-001");
  });

  it("sanitizes the same stored failure when the POST action returns status", async () => {
    const response = await postEmbeddingIndex(request("POST", { action: "retry" }), "kb-1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.errorMessage).toContain("existing index remains available");
    expect(body.job.errorMessage).not.toContain("429");
    expect(mocks.retryReindexJob).toHaveBeenCalledWith("kb-1");
  });

  it("does not leak re-index diagnostics when the requester cannot read the KB", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      new (await import("next/server")).NextResponse("Forbidden", { status: 403 }),
    );
    const response = await getEmbeddingIndex(request(), "kb-other");
    expect(response.status).toBe(403);
    expect(mocks.queryOne).not.toHaveBeenCalled();
  });
});
