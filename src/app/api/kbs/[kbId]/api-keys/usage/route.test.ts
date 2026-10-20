import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  getKnowledgeBaseById: vi.fn(),
  poolQuery: vi.fn(),
  getOrgDailyUsage: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getKnowledgeBaseById: mocks.getKnowledgeBaseById,
}));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.poolQuery } }));
vi.mock("@/modules/embed/core/api-keys-db", () => ({
  getOrgDailyUsage: mocks.getOrgDailyUsage,
}));

import { GET } from "./route";

const request = () => new NextRequest("http://localhost/api/kbs/kb-private/api-keys/usage");
const params = { params: Promise.resolve({ kbId: "kb-private" }) };

describe("KB API-key usage analytics access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue({ orgId: "org-private" });
    mocks.getKnowledgeBaseById.mockResolvedValue({ id: "kb-private" });
    mocks.getOrgDailyUsage.mockResolvedValue(3);
    mocks.poolQuery.mockImplementation(async (statement: string) => {
      if (statement.includes("SELECT p.org_id")) return { rows: [{ org_id: "org-private" }] };
      if (statement.includes("FROM api_keys ak")) {
        return { rows: [{
          id: "key-1", name: "Customer API", key_prefix: "clr_private",
          is_active: true, last_used_at: null, this_hour: "1",
          last_24h: "3", last_7d: "7", last_30d: "14",
        }] };
      }
      if (statement.includes("FROM org_subscriptions os")) {
        return { rows: [{
          plan_id: "plan-1", plan_name: "Active plan",
          max_req_day: 100, voice_enabled: true,
        }] };
      }
      if (statement.includes("to_char(")) {
        return { rows: [{ hour: "2026-10-20T00:00:00Z", count: "2" }] };
      }
      return { rows: [{ last_24h: "3", last_7d: "7", last_30d: "14" }] };
    });
  });

  it("rejects unauthenticated analytics reads before querying tenant information", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    );
    const response = await GET(request(), params);
    expect(response.status).toBe(401);
    expect(mocks.requireKbPermission).not.toHaveBeenCalled();
    expect(mocks.getKnowledgeBaseById).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("denies authenticated members without read access to the requested KB", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await GET(request(), params);
    expect(response.status).toBe(403);
    expect(mocks.getKnowledgeBaseById).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("returns not found only after KB authorization", async () => {
    mocks.getKnowledgeBaseById.mockResolvedValueOnce(null);
    const response = await GET(request(), params);
    expect(response.status).toBe(404);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-private", "kb:read",
    );
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("retains analytics for users with current KB read permission", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.keys).toEqual([
      expect.objectContaining({ keyId: "key-1", keyPrefix: "clr_private" }),
    ]);
    expect(data.quota.orgDailyUsage).toBe(3);
    expect(data.summary).toEqual({ last24h: 3, last7d: 7, last30d: 14 });
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE kb.id = $1"),
      ["kb-private"],
    );
  });
});
