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

const request = () => new NextRequest("https://clara.example.test/api/platform/revenue");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
  mocks.requireSuperAdmin.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("plan_mrr")) return [
      { plan_id: "starter", plan_name: "Starter", price_usd: 99, org_count: 1, plan_mrr: 49 },
      { plan_id: "enterprise", plan_name: "Enterprise", price_usd: -1, org_count: 1, plan_mrr: 500 },
      { plan_id: "free", plan_name: "Free", price_usd: 0, org_count: 3, plan_mrr: 0 },
    ];
    if (sql.includes("new_subs")) return [];
    return [{ plan_id: "free", count: 3 }, { plan_id: "starter", count: 1 }];
  });
});

describe("platform revenue reflects eligible subscriptions and their contracted prices", () => {
  it("counts only active subscriptions in MRR, using nonnegative pinned price snapshots", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const [byPlan] = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(byPlan).toMatch(/os\.status\s*=\s*'active'/);
    expect(byPlan).toMatch(/COALESCE\(os\.price_snapshot,\s*sp\.price_usd\)/);
    expect(byPlan).toMatch(/CASE\s+WHEN[^]*?>\s*0/);
    expect((await response.json())).toMatchObject({ totalMrr: 549, totalArr: 6588 });
  });

  it("does not classify canceled or unverified organisations under paid plans", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const [,, distribution] = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(distribution).toMatch(/LEFT JOIN org_subscriptions os ON os\.org_id\s*=\s*o\.id/);
    expect(distribution).toMatch(/os\.status\s+IN\s*\('active',\s*'trialing'\)/);
    expect(distribution).toMatch(/COALESCE\(os\.plan_id,\s*'free'\)/);
    expect(distribution).not.toMatch(/os\.status\s+IN\s*\([^)]*'payment_pending'/);
  });

  it("keeps unauthenticated callers away from all revenue queries", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new NextResponse("Unauthorized", { status: 401 }));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps payment and query internals private on DB failures", async () => {
    mocks.query.mockRejectedValueOnce(new Error("db://private-connection"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("db://private-connection");
  });
});
