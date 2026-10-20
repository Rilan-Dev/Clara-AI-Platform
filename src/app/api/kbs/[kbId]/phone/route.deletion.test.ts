import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  deletePhoneConfig: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/phone/core/db", () => ({
  getPhoneConfigsByKb: vi.fn(),
  upsertPhoneConfig: vi.fn(),
  deletePhoneConfig: mocks.deletePhoneConfig,
  checkPhoneCallsEnabled: vi.fn(),
}));

import { DELETE } from "./route";

const params = { params: Promise.resolve({ kbId: "kb-owned" }) };
const request = (configId = "config-owned") =>
  new NextRequest(`http://localhost/api/kbs/kb-owned/phone?id=${configId}`, {
    method: "DELETE",
  });

describe("phone configuration deletion tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-owned" } });
    mocks.requireKbPermission.mockResolvedValue({ orgId: "org-owned" });
    mocks.deletePhoneConfig.mockResolvedValue(true);
  });

  it("denies users without KB update permission before touching phone settings", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const result = await DELETE(request(), params);
    expect(result.status).toBe(403);
    expect(mocks.deletePhoneConfig).not.toHaveBeenCalled();
  });

  it("returns 404 for a phone config owned by another KB", async () => {
    mocks.deletePhoneConfig.mockResolvedValueOnce(false);
    const result = await DELETE(request("config-foreign"), params);
    expect(result.status).toBe(404);
    expect(mocks.deletePhoneConfig).toHaveBeenCalledWith("config-foreign", "kb-owned");
  });

  it("refuses to delete without a config id", async () => {
    const result = await DELETE(
      new NextRequest("http://localhost/api/kbs/kb-owned/phone", { method: "DELETE" }),
      params,
    );
    expect(result.status).toBe(400);
    expect(mocks.deletePhoneConfig).not.toHaveBeenCalled();
  });

  it("deletes only a config bound to an authorized KB", async () => {
    const result = await DELETE(request(), params);
    expect(result.status).toBe(200);
    expect((await result.json()).ok).toBe(true);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-owned", "kb:update",
    );
    expect(mocks.deletePhoneConfig).toHaveBeenCalledWith("config-owned", "kb-owned");
  });
});
