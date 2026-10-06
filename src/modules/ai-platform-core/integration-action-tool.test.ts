import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
const runAction = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/plan-guard", () => ({
  getOrgPlanLimits: vi.fn().mockResolvedValue({ plan_id: "pro", plan_name: "Pro" }),
}));
vi.mock("@/modules/integrations/registry", () => ({
  getIntegration: vi.fn().mockReturnValue({
    id: "example",
    displayName: "Example",
    authType: "none",
  }),
}));
vi.mock("@/modules/integrations/runtime/runner-core", () => ({ runAction }));

describe("integration action tool scope propagation", () => {
  it("passes agentId separately from projectId to the runner", async () => {
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([{ id: "connection-1" }]);
    runAction.mockResolvedValue({ success: true, output: { ok: true } });

    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    const result = await tool.execute(
      { integrationId: "example", actionName: "do_work", props: { value: 1 } },
      {
        tenantId: "org-1",
        agentId: "agent-1",
        userId: "user-1",
        projectId: "project-1",
        surface: "chat",
      } as never,
    );

    expect(result).toEqual({ ok: true });
    expect(runAction).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "org-1",
      agentId: "agent-1",
      userId: "user-1",
    }));
    expect(runAction.mock.calls[0][0]).not.toHaveProperty("projectId");
  });

  it("fails closed when the platform plan allowlist is malformed", async () => {
    query.mockReset();
    runAction.mockReset();
    query.mockResolvedValueOnce([{ enabled: true, allowed_plans: null }]);

    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    await expect(tool.execute(
      { integrationId: "example", actionName: "do_work", props: {} },
      {
        tenantId: "org-1",
        agentId: "agent-1",
        userId: "user-1",
        surface: "chat",
      } as never,
    )).rejects.toMatchObject({ code: "PLAN_NOT_ENTITLED" });

    expect(runAction).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the agent grant does not belong to the execution tenant", async () => {
    query.mockReset();
    runAction.mockReset();
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      // Agent grant lookup is tenant-bound by joining agents on org_id.
      .mockResolvedValueOnce([]);

    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    await expect(tool.execute(
      { integrationId: "example", actionName: "do_work", props: {} },
      {
        tenantId: "org-other",
        agentId: "agent-1",
        userId: "user-1",
        surface: "chat",
      } as never,
    )).rejects.toMatchObject({ code: "TENANT_SCOPE_VIOLATION" });

    expect(runAction).not.toHaveBeenCalled();
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("a.org_id=$2"),
      ["agent-1", "org-other", "example"],
    );
  });
});
