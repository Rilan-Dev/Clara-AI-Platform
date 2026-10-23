import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
import { GET } from "./route";

const request = () => new NextRequest("https://clara.example.test/api/platform/stats");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
  mocks.requireSuperAdmin.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("AS mrr")) return [{ mrr: 549, paying_count: 2 }];
    return [{ count: 5 }];
  });
});

describe("platform overview revenue agrees with subscription price snapshots", () => {
  it("uses active positive pinned prices for platform MRR and paid-organisation count", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const subscriptionSQL = String(mocks.query.mock.calls[2]?.[0]);
    expect(subscriptionSQL).toMatch(/os\.status\s*=\s*'active'/);
    expect(subscriptionSQL).toMatch(/COALESCE\(os\.price_snapshot,\s*sp\.price_usd\)/);
    expect(subscriptionSQL).toMatch(/>\s*0/);
    expect(await response.json()).toMatchObject({ mrr: 549, payingOrgs: 2, totalOrgs: 5 });
  });

  it("never queries analytics before super-admin authorisation", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(new NextResponse("Forbidden", { status: 403 }));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
