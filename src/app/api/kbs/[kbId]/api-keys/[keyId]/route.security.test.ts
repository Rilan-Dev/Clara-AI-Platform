import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  getApiKeyById: vi.fn(),
  updateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/embed/core/api-keys-db", () => ({
  getApiKeyById: mocks.getApiKeyById,
  updateApiKey: mocks.updateApiKey,
  revokeApiKey: mocks.revokeApiKey,
}));

import { PATCH, DELETE } from "./route";

const params = { params: Promise.resolve({ kbId: "kb-tenant", keyId: "key-tenant" }) };
const patch = (body: unknown = { name: "Updated key" }) =>
  new NextRequest("http://localhost/api/kbs/kb-tenant/api-keys/key-tenant", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const remove = () =>
  new NextRequest("http://localhost/api/kbs/kb-tenant/api-keys/key-tenant", { method: "DELETE" });
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

describe("per-key update and revocation tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-tenant" } });
    mocks.requireKbPermission.mockResolvedValue({ orgId: "org-tenant" });
    mocks.getApiKeyById.mockResolvedValue({ id: "key-tenant", kbId: "kb-tenant" });
    mocks.updateApiKey.mockResolvedValue({ id: "key-tenant", name: "Updated key" });
    mocks.revokeApiKey.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated PATCH before loading another tenant's key", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await PATCH(patch(), params);
    expect(res.status).toBe(401);
    expect(mocks.requireKbPermission).not.toHaveBeenCalled();
    expect(mocks.getApiKeyById).not.toHaveBeenCalled();
    expect(mocks.updateApiKey).not.toHaveBeenCalled();
  });

  it("rejects a foreign-KB PATCH before reading its key record", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(forbidden());
    const res = await PATCH(patch(), params);
    expect(res.status).toBe(403);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-tenant", "kb:update",
    );
    expect(mocks.getApiKeyById).not.toHaveBeenCalled();
    expect(mocks.updateApiKey).not.toHaveBeenCalled();
  });

  it("rejects a foreign-KB DELETE without revoking the target key", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(forbidden());
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(403);
    expect(mocks.getApiKeyById).not.toHaveBeenCalled();
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it("rejects a missing session for key deletion before reading DB records", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(401);
    expect(mocks.getApiKeyById).not.toHaveBeenCalled();
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it("still denies a mismatched keyId even when its KB path is authorized", async () => {
    mocks.getApiKeyById.mockResolvedValueOnce({ id: "key-tenant", kbId: "kb-other" });
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(404);
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it("preserves authorized key settings updates", async () => {
    const res = await PATCH(patch({ name: "Updated key", rateLimitPerHour: 100 }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).key.name).toBe("Updated key");
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-tenant", "kb:update",
    );
    expect(mocks.updateApiKey).toHaveBeenCalledWith("key-tenant", {
      name: "Updated key",
      allowedOrigins: undefined,
      rateLimitPerHour: 100,
      designEditEnabled: undefined,
    });
  });

  it("preserves authorized key revocation", async () => {
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-tenant", "kb:update",
    );
    expect(mocks.revokeApiKey).toHaveBeenCalledWith("key-tenant");
  });
});
