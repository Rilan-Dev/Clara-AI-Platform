import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  requireKbPermission: vi.fn(),
  getAgentById: vi.fn(),
  createKnowledgeBase: vi.fn(),
  listKnowledgeBases: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  updateKnowledgeBase: vi.fn(),
  deleteKnowledgeBase: vi.fn(),
  resolveAIConfig: vi.fn(),
  toProviderConfig: vi.fn(),
  getProvider: vi.fn(),
  ensureCollectionExists: vi.fn(),
  planGuard: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireAgentPermission: mocks.requireAgentPermission,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/organisations/core/db", () => ({ getAgentById: mocks.getAgentById }));
vi.mock("../core/db", () => ({
  createKnowledgeBase: mocks.createKnowledgeBase,
  listKnowledgeBases: mocks.listKnowledgeBases,
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
  updateKnowledgeBase: mocks.updateKnowledgeBase,
  deleteKnowledgeBase: mocks.deleteKnowledgeBase,
}));
vi.mock("@/modules/admin/core/vector-store", () => ({
  ensureCollectionExists: mocks.ensureCollectionExists,
  getQdrantClient: vi.fn(),
}));
vi.mock("@/modules/ai-core/factory", () => ({ ProviderFactory: { getProvider: mocks.getProvider } }));
vi.mock("@/modules/ai-core/resolve", () => ({
  resolveAIConfig: mocks.resolveAIConfig,
  toProviderConfig: mocks.toProviderConfig,
}));
vi.mock("@/lib/plan-guard", () => ({
  planGuard: mocks.planGuard,
  planLimitResponse: vi.fn(),
}));
vi.mock("@/modules/auth/core/db", () => ({ writeAuditLog: mocks.writeAuditLog }));

import { createKbHandler, listKbsHandler, getKbHandler, updateKbHandler } from "./kbs";

const url = "https://clara.example.test/api/agents/agent-1/kbs";
const req = (method = "GET", body?: unknown) =>
  new NextRequest(url, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

describe("KB CRUD API unexpected error privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "org-user" } });
    mocks.requireAgentPermission.mockResolvedValue(undefined);
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.getAgentById.mockResolvedValue({ id: "agent-1", orgId: "org-1" });
    mocks.getKnowledgeBaseById.mockResolvedValue({ id: "kb-1", status: "active" });
    mocks.createKnowledgeBase.mockResolvedValue({
      id: "kb-1", name: "Policies", qdrantCollection: "kb_secret_col",
    });
    mocks.listKnowledgeBases.mockResolvedValue([]);
    mocks.planGuard.mockResolvedValue({ allowed: true });
    mocks.resolveAIConfig.mockResolvedValue({});
    mocks.getProvider.mockReturnValue({ getEmbeddingDimension: () => 1536 });
    mocks.ensureCollectionExists.mockResolvedValue(undefined);
    mocks.deleteKnowledgeBase.mockResolvedValue(undefined);
    mocks.writeAuditLog.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("never echoes a Qdrant upstream error, even when collection creation rolls back", async () => {
    const internal = new Error("Qdrant 503 https://vector.private.lan?api_key=SECRET");
    mocks.ensureCollectionExists.mockRejectedValueOnce(internal);
    const response = await createKbHandler(req("POST", { name: "Policies" }), "agent-1");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("knowledge-base request could not be completed");
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("vector.private.lan");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.deleteKnowledgeBase).toHaveBeenCalledWith("kb-1");
    expect(console.error).toHaveBeenCalled();
  });

  it("never echoes database credentials from KB list or details", async () => {
    const internal = new Error("postgres://svc:pass@db.local:5432/secret");
    mocks.listKnowledgeBases.mockRejectedValueOnce(internal);
    mocks.getKnowledgeBaseById.mockRejectedValueOnce(internal);
    for (const call of [
      () => listKbsHandler(req(), "agent-1"),
      () => getKbHandler(req(), "kb-1"),
    ]) {
      const response = await call();
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("postgres://");
    }
  });

  it("keeps explicit missing-KB 404 and malformed create request 400", async () => {
    mocks.getKnowledgeBaseById.mockResolvedValueOnce(null);
    expect((await getKbHandler(req(), "kb-missing")).status).toBe(404);
    expect((await createKbHandler(req("POST", {}), "agent-1")).status).toBe(400);
  });

  it("keeps permission failures intact, without reading or mutating KB data", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const response = await updateKbHandler(req("PATCH", { name: "Injected" }), "kb-1");
    expect(response.status).toBe(403);
    expect(mocks.updateKnowledgeBase).not.toHaveBeenCalled();
  });
});
