import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
const getOrgPlanLimits = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/plan-guard", () => ({ getOrgPlanLimits }));
vi.mock("../../registry/index.js", () => ({
  getIntegration: vi.fn().mockReturnValue({
    id: "example",
    displayName: "Example",
  }),
}));

describe("integration execution authorization", () => {
  it("fails closed when the current plan is no longer entitled", async () => {
    getOrgPlanLimits.mockResolvedValue({ plan_id: "free", plan_name: "Free" });
    query.mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }]);

    const { assertIntegrationExecutionAuthorized } = await import("./execution-authorization.js");

    await expect(assertIntegrationExecutionAuthorized({
      integrationId: "example",
      workspaceId: "org-1",
      agentId: "agent-1",
    })).rejects.toThrow("current plan cannot use Example");

    expect(query).toHaveBeenCalledTimes(1);
  });

  it("requires the agent grant to belong to the execution tenant", async () => {
    getOrgPlanLimits.mockResolvedValue({ plan_id: "pro", plan_name: "Pro" });
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([]);

    const { assertIntegrationExecutionAuthorized } = await import("./execution-authorization.js");

    await expect(assertIntegrationExecutionAuthorized({
      integrationId: "example",
      workspaceId: "org-1",
      agentId: "agent-1",
    })).rejects.toThrow("not enabled for this agent");

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("a.org_id=$2"),
      ["agent-1", "org-1", "example"],
    );
  });

  it("requires an explicit agent scope", async () => {
    getOrgPlanLimits.mockResolvedValue({ plan_id: "pro", plan_name: "Pro" });
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }]);

    const { assertIntegrationExecutionAuthorized } = await import("./execution-authorization.js");

    await expect(assertIntegrationExecutionAuthorized({
      integrationId: "example",
      workspaceId: "org-1",
    })).rejects.toThrow("requires an explicitly scoped agent");
  });
});
