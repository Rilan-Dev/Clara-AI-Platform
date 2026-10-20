import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  getAllKeysUsageStats: vi.fn(),
  checkApiKeyQuota: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/embed/core/api-keys-db", () => ({
  listApiKeys: mocks.listApiKeys,
  createApiKey: mocks.createApiKey,
  getAllKeysUsageStats: mocks.getAllKeysUsageStats,
}));
vi.mock("@/modules/embed/core/subscription-guard", () => ({
  checkApiKeyQuota: mocks.checkApiKeyQuota,
}));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ kbId: "kb-private" }) };

describe("API-key listing and creation permission responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue({ orgId: "org-1" });
  });

  it("preserves the 401 response returned by the authentication boundary", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await GET(new NextRequest("http://localhost/api/kbs/kb-private/api-keys"), params);
    expect(response.status).toBe(401);
    expect(mocks.listApiKeys).not.toHaveBeenCalled();
  });

  it("preserves the 403 response returned by KB update permissions", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(new NextRequest("http://localhost/api/kbs/kb-private/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized" }),
    }), params);
    expect(response.status).toBe(403);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(expect.anything(), "kb-private", "kb:update");
    expect(mocks.checkApiKeyQuota).not.toHaveBeenCalled();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });
});
