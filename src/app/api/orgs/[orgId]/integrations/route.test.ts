import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const getOrgPlanLimitsMock = vi.fn();
const resolveOrgPlanLimitsMock = vi.fn();
const withTransactionMock = vi.fn(async (
  fn: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>,
) => fn({
  query: async (sql, params) => ({ rows: await queryMock(sql, params) }),
}));

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
  requireOrgPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/integrations/registry", () => ({
  listIntegrations: vi.fn().mockReturnValue([
    { id: "github", displayName: "GitHub", authType: "oauth2" },
  ]),
}));

vi.mock("@/lib/plan-guard", () => ({
  getOrgPlanLimits: getOrgPlanLimitsMock,
  resolveOrgPlanLimits: resolveOrgPlanLimitsMock,
}));

vi.mock("@/lib/secrets", () => ({
  ENCRYPTION_KEY: "test-key",
}));

describe("organisation integration entitlement enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows disabling an existing integration after a plan downgrade without reading plan limits", async () => {
    queryMock
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([]);

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", action: "disable" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(getOrgPlanLimitsMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a direct connection that would implicitly exceed the organisation integration limit", async () => {
    queryMock
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["free"] }])
      .mockResolvedValueOnce([{ enabled: false }])
      .mockResolvedValueOnce([{ count: 2 }]);
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free", max_integrations: 2 });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        integrationId: "github",
        action: "connect",
        credentials: { access_token: "secret" },
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "Your free plan allows 2 integrations",
      code: "INTEGRATION_LIMIT_REACHED",
      limit: 2,
      current: 2,
    });
    expect(resolveOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects enabling when the current plan is no longer entitled", async () => {
    queryMock.mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }]);
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free", max_integrations: 10 });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", action: "enable" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "The free plan cannot use this integration",
      code: "PLAN_NOT_ENTITLED",
    });
    expect(resolveOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the platform plan allowlist is malformed", async () => {
    queryMock.mockResolvedValueOnce([{ enabled: true, allowed_plans: null }]);
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "pro", max_integrations: 10 });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", action: "enable" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "The pro plan cannot use this integration",
      code: "PLAN_NOT_ENTITLED",
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when authoritative plan resolution is unavailable", async () => {
    queryMock.mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }]);
    resolveOrgPlanLimitsMock.mockRejectedValueOnce(new Error("plan lookup failed"));

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", action: "enable" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Integration plan entitlement could not be verified",
    });
    expect(resolveOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(withTransactionMock).not.toHaveBeenCalled();
  });

  it("persists the registry auth type instead of caller-supplied auth type", async () => {
    queryMock
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["free"] }])
      .mockResolvedValueOnce([{ enabled: false }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "connection-1" }]);
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free", max_integrations: 2 });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        integrationId: "github",
        action: "connect",
        authType: "secret_text",
        credentials: { access_token: "secret" },
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(201);
    const insertCall = queryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO integration_connections"),
    );
    expect(insertCall?.[1]?.[4]).toBe("oauth2");
  });

  it("uses one transaction for direct connection enablement and does not return success after the connection insert fails", async () => {
    queryMock
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["free"] }])
      .mockResolvedValueOnce([{ enabled: false }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("connection insert failed"));
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free", max_integrations: 2 });

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        integrationId: "github",
        action: "connect",
        credentials: { access_token: "secret" },
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ orgId: "org-1" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to update integration access" });
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
  });
});
