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

const request = () => new NextRequest("https://clara.example.test/api/analytics/revenue?from=2026-05-01&to=2026-10-01");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
  mocks.requireSuperAdmin.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("generate_series")) return [];
    if (sql.includes("FROM organisations o")) return [{ plan_id: "free", plan_name: "Free", count: 3, mrr: 0 }];
    if (sql.includes("FROM billing_events")) return [];
    return [{ mrr: 549, arr: 6588, paying_orgs: 2, trial_orgs: 1 }];
  });
});

describe("revenue analytics current metrics match active contracted subscription state", () => {
  it("uses pinned prices and excludes inactive statuses from current paid distribution", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const distribution = String(mocks.query.mock.calls[1]?.[0]);
    expect(distribution).toMatch(/os\.status\s+IN\s*\('active',\s*'trialing'\)/);
    expect(distribution).toMatch(/WHEN os\.status\s*=\s*'active'/);
    expect(distribution).toMatch(/COALESCE\(os\.price_snapshot,\s*sp\.price_usd\)/);
    expect(distribution).toMatch(/THEN COALESCE\(os\.price_snapshot,\s*sp\.price_usd\)/);
    expect((await response.json()).totals).toMatchObject({ mrr: 549, arr: 6588 });
  });

  it("totals use only active positive snapshots, not mutable plan-catalog prices", async () => {
    await GET(request());
    const totals = String(mocks.query.mock.calls[3]?.[0]);
    expect(totals).toMatch(/os\.status\s*=\s*'active'/);
    expect(totals).toMatch(/COALESCE\(os\.price_snapshot,\s*sp\.price_usd\)/);
    expect(totals).toMatch(/>\s*0/);
  });

  it("keeps authorization before all revenue database queries", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(new NextResponse("Forbidden", { status: 403 }));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not return raw SQL connection messages from the reporting endpoint", async () => {
    mocks.query.mockRejectedValueOnce(new Error("password=password123 private-storage-host"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-storage-host");
  });
});
