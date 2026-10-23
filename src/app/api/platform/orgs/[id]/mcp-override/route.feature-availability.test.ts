import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  query: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  resolveEffectiveMcpEntitlements: vi.fn(),
  recordPlatformMcpAudit: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/modules/mcp", () => ({
  MCP_OVERRIDE_KEYS: ["maxConnections"],
  mcpOverrideSchema: { safeParse: vi.fn(() => ({ success: true, data: { maxConnections: 2 } })) },
  resolveEffectiveMcpEntitlements: mocks.resolveEffectiveMcpEntitlements,
  recordPlatformMcpAudit: mocks.recordPlatformMcpAudit,
}));

import { GET, PUT, DELETE } from "./route";

const context = { params: Promise.resolve({ id: "org-1" }) };
const request = (method: "GET" | "PUT" | "DELETE") =>
  new NextRequest("https://clara.example.test/api/platform/orgs/org-1/mcp-override", {
    method,
    ...(method === "PUT" ? {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Temporary project exception", entitlements: { maxConnections: 2 } }),
    } : {}),
  });

afterEach(() => vi.unstubAllEnvs());

describe("MCP override API feature isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "false");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
    mocks.requireSuperAdmin.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([{ id: "org-1" }]);
    mocks.recordPlatformMcpAudit.mockResolvedValue(undefined);
    mocks.resolveEffectiveMcpEntitlements.mockResolvedValue({
      planId: "plan-1", planName: "Pro", subscriptionStatus: "active",
      available: true, denialReason: null,
      entitlements: {}, sources: {}, globalSettings: {},
      periodStart: "2026-10-01",
    });
  });

  it.each(["GET", "PUT", "DELETE"] as const)(
    "denies direct %s even if middleware is bypassed, without reading or mutating database records",
    async (method) => {
      const response = await ({ GET, PUT, DELETE }[method])(request(method), context);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "FEATURE_DISABLED" });
      expect(mocks.requireSuperAdmin).toHaveBeenCalledOnce();
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.resolveEffectiveMcpEntitlements).not.toHaveBeenCalled();
      expect(mocks.recordPlatformMcpAudit).not.toHaveBeenCalled();
    },
  );

  it("preserves super-admin authorization before evaluating feature availability", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await PUT(request("PUT"), context);
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.recordPlatformMcpAudit).not.toHaveBeenCalled();
  });

  it("continues normal MCP override management in an explicitly enabled development environment", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "true");
    mocks.query
      .mockResolvedValueOnce([{ id: "org-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        connections: 0, tools_approved: 0, agent_assignments: 0, period_calls: 0,
      }]);
    const response = await GET(request("GET"), context);
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalled();
    expect(mocks.resolveEffectiveMcpEntitlements).toHaveBeenCalledWith("org-1");
  });
});
