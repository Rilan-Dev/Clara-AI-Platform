import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  query: vi.fn(),
  validateMcpEntitlements: vi.fn(),
  recordPlatformMcpAudit: vi.fn(),
}));
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/lib/db", () => ({ query: mocks.query, pool: { connect: vi.fn() } }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/modules/mcp", () => ({
  validateMcpEntitlements: mocks.validateMcpEntitlements,
  recordPlatformMcpAudit: mocks.recordPlatformMcpAudit,
}));

import { POST } from "./route";

const request = (body: object) =>
  new NextRequest("https://clara.example.test/api/platform/subscription-plans", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: "starter", name: "Starter Plus", ...body }),
  });

const stored = { id: "starter", name: "Starter", price_usd: 10,
  mcp_entitlements: { enabled: true, maxConnections: 2 } };

afterEach(() => vi.unstubAllEnvs());

describe("shared subscription plan MCP isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "production");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.requireSuperAdmin.mockResolvedValue(undefined);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT * FROM subscription_plans")) return [stored];
      if (sql.includes("SELECT COALESCE(MAX(version)")) return [{ version: 7 }];
      if (sql.includes("INSERT INTO subscription_plan_versions")) return [{ id: "version-7", version: 7 }];
      return [];
    });
    mocks.validateMcpEntitlements.mockReturnValue({
      ok: true, value: { enabled: true, maxConnections: 4 },
    });
    mocks.recordPlatformMcpAudit.mockResolvedValue(undefined);
  });

  it.each([
    { mcpEntitlements: { enabled: true, maxConnections: 100 } },
    { mcpEntitlements: { enabled: false } },
    { mcpEntitlements: null },
  ])("rejects any explicit MCP mutation in disabled production before DB/audit", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.recordPlatformMcpAudit).not.toHaveBeenCalled();
    expect(mocks.validateMcpEntitlements).not.toHaveBeenCalled();
  });

  it("still creates a normal plan draft when an unrelated billing field changes", async () => {
    const response = await POST(request({ priceUsd: 22 }));
    expect(response.status).toBe(201);
    expect((await response.json()).version).toMatchObject({ id: "version-7" });
    expect(mocks.validateMcpEntitlements).not.toHaveBeenCalled();
    expect(mocks.recordPlatformMcpAudit).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) =>
      (sql as string).includes("INSERT INTO subscription_plan_versions"),
    )).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) =>
      (sql as string).includes("UPDATE subscription_plans SET mcp_entitlements"),
    )).toBe(false);
  });

  it("retains MCP entitlement editing for authorized development", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    const response = await POST(request({ mcpEntitlements: { enabled: true, maxConnections: 4 } }));
    expect(response.status).toBe(201);
    expect(mocks.validateMcpEntitlements).toHaveBeenCalledOnce();
    expect(mocks.recordPlatformMcpAudit).toHaveBeenCalledOnce();
  });

  it("honors an explicit enable override independently of production default", async () => {
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "true");
    const response = await POST(request({ mcpEntitlements: { enabled: true, maxConnections: 4 } }));
    expect(response.status).toBe(201);
    expect(mocks.recordPlatformMcpAudit).toHaveBeenCalledOnce();
  });

  it("does not leak feature availability to a requester lacking platform-admin rights", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(request({ mcpEntitlements: { enabled: true } }));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
