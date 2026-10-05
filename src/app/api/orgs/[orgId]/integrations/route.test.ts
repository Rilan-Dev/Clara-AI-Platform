import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const getOrgPlanLimitsMock = vi.fn();

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
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

  it("rejects enabling when the current plan is no longer entitled", async () => {
    queryMock.mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }]);
    getOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free", max_integrations: 10 });

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
    expect(getOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
