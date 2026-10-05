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
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
  requireAgentPermission: vi.fn().mockResolvedValue({ orgId: "org-1" }),
}));

vi.mock("@/modules/integrations/registry", () => ({
  listIntegrations: vi.fn().mockReturnValue([
    { id: "github", name: "GitHub" },
  ]),
}));

vi.mock("@/lib/plan-guard", () => ({
  getOrgPlanLimits: getOrgPlanLimitsMock,
}));

describe("agent integration entitlement enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ enabled: true }]);
    getOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free" });
  });

  it("rejects an agent integration grant when the organisation plan is no longer entitled", async () => {
    const { PATCH } = await import("./route");

    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: true }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "The free plan cannot use this integration",
      code: "PLAN_NOT_ENTITLED",
    });
    expect(getOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("allows disabling an existing grant after a plan downgrade", async () => {
    queryMock
      .mockReset()
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([]);

    const { PATCH } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: false }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      integrationId: "github",
      enabled: false,
    });
    expect(getOrgPlanLimitsMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});
