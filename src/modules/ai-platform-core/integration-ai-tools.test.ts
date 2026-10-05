import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const getOrgPlanLimits = vi.fn();
const listIntegrations = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/plan-guard", () => ({ getOrgPlanLimits }));
vi.mock("@/modules/integrations/registry", () => ({ listIntegrations }));

describe("integration availability plan entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listIntegrations.mockReturnValue([
      { id: "github", displayName: "GitHub", description: "GitHub API", actions: ["list_repos"] },
    ]);
  });

  it("does not expose an agent integration when the organisation plan is no longer entitled", async () => {
    getOrgPlanLimits.mockResolvedValue({ plan_id: "free" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ integration_id: "github" }]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", surface: "chat" } as never,
    );

    expect(result).toEqual([]);
    expect(getOrgPlanLimits).toHaveBeenCalledWith("org-1");
  });

  it("exposes an entitled integration when the current plan is allowed", async () => {
    getOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ integration_id: "github" }]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", surface: "chat" } as never,
    );

    expect(result).toEqual([
      {
        id: "github",
        name: "GitHub",
        description: "GitHub API",
        connected: true,
        actions: ["list_repos"],
        help: "Use the connected GitHub integration through its supported actions.",
      },
    ]);
  });
});
