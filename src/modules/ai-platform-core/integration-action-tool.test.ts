import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.stubEnv("CLARA_ENV", "development"));
afterEach(() => vi.unstubAllEnvs());

const query = vi.fn();
const runAction = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/plan-guard", () => ({
  resolveOrgPlanLimits: vi.fn().mockResolvedValue({ plan_id: "pro", plan_name: "Pro" }),
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
  it("rejects missing user or agent identity before querying grants", async () => {
    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    await expect(tool.execute(
      { integrationId: "example", actionName: "do_work", props: {} },
      { tenantId: "org-1", agentId: undefined, userId: undefined, surface: "chat" } as never,
    )).rejects.toMatchObject({ code: "MISSING_CONTEXT_IDENTITY" });

    expect(query).not.toHaveBeenCalled();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("passes agentId separately from projectId to the runner", async () => {
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([{ enabled: true }]);
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
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("a.org_id=$2"),
      ["agent-1", "org-1", "example"],
    );
  });

  it("preserves runner error codes and retryability in the unified tool failure", async () => {
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([{ enabled: true }]);
    runAction.mockResolvedValue({
      success: false,
      output: null,
      error: "Provider token expired",
      errorCode: "TOKEN_EXPIRED",
      retryable: true,
    });

    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    await expect(tool.execute(
      { integrationId: "example", actionName: "do_work", props: {} },
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    )).rejects.toMatchObject({
      code: "EXECUTION_FAILED",
      details: {
        integrationId: "example",
        actionName: "do_work",
        runnerErrorCode: "TOKEN_EXPIRED",
        retryable: true,
      },
    });
  });

  it("does not treat another user's connection as current-user readiness", async () => {
    const { getIntegration } = await import("@/modules/integrations/registry");
    vi.mocked(getIntegration).mockReturnValueOnce({
      id: "example",
      displayName: "Example",
      authType: "oauth2",
    } as never);
    query
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["*"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([]);

    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    await expect(tool.execute(
      { integrationId: "example", actionName: "do_work", props: {} },
      {
        tenantId: "org-1",
        agentId: "agent-1",
        userId: "user-2",
        surface: "chat",
      } as never,
    )).rejects.toMatchObject({ code: "EXECUTION_FAILED" });

    expect(runAction).not.toHaveBeenCalled();
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("(user_id=$4 OR user_id IS NULL)"),
      ["org-1", "example", "agent-1", "user-2"],
    );
  });

  it("sanitizes authorization database failures instead of exposing driver errors", async () => {
    query.mockRejectedValueOnce(new Error("secret_schema_name column password_hash missing"));

    const { buildIntegrationActionTool } = await import("./integration-action-tool.js");
    const tool = buildIntegrationActionTool();

    await expect(tool.execute(
      { integrationId: "example", actionName: "do_work", props: {} },
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    )).rejects.toMatchObject({
      code: "AUTHORIZATION_UNAVAILABLE",
      message: "Platform integration policy could not be verified.",
    });
    expect(runAction).not.toHaveBeenCalled();
  });

  it("fails closed when plan entitlement resolution fails", async () => {
    query.mockReset();
    runAction.mockReset();
    const { resolveOrgPlanLimits } = await import("@/lib/plan-guard");
    vi.mocked(resolveOrgPlanLimits).mockRejectedValueOnce(new Error("database unavailable"));

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
    )).rejects.toMatchObject({ code: "AUTHORIZATION_UNAVAILABLE" });

    expect(runAction).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
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
