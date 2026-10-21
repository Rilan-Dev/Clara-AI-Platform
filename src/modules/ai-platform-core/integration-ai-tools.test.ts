import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const resolveOrgPlanLimits = vi.fn();
const listIntegrations = vi.fn();
const getIntegrationActions = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/plan-guard", () => ({ resolveOrgPlanLimits }));
vi.mock("@/modules/integrations/registry", () => ({ listIntegrations }));
vi.mock("@/modules/integrations/runtime/runner-core", () => ({ getIntegrationActions }));

describe("integration availability plan entitlement", () => {
  beforeEach(() => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.clearAllMocks();
    getIntegrationActions.mockResolvedValue([{ name: "list_repos" }]);
    listIntegrations.mockReturnValue([
      { id: "github", displayName: "GitHub", description: "GitHub API", actions: ["list_repos"] },
    ]);
  });

  it("returns no capabilities before querying when caller identity is incomplete", async () => {
    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: undefined, userId: undefined, surface: "chat" } as never,
    );

    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(resolveOrgPlanLimits).not.toHaveBeenCalled();
  });

  it("does not expose an agent integration when the organisation plan is no longer entitled", async () => {
    resolveOrgPlanLimits.mockResolvedValue({ plan_id: "free" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ integration_id: "github" }]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    );

    expect(result).toEqual([]);
    expect(resolveOrgPlanLimits).toHaveBeenCalledWith("org-1");
  });

  it("exposes an entitled integration when the current plan is allowed", async () => {
    resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ integration_id: "github", status: "active" }]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    );

    expect(result).toEqual([
      {
        id: "github",
        name: "GitHub",
        description: "GitHub API",
        connected: true,
        connectionStatus: "active",
        actions: ["list_repos"],
        help: "Use the connected GitHub integration through its supported actions.",
      },
    ]);
  });

  it("tells the agent when an eligible integration connection has expired", async () => {
    resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ integration_id: "github", status: "expired" }]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();
    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    );

    expect(result).toEqual([{
      id: "github",
      name: "GitHub",
      description: "GitHub API",
      connected: false,
      connectionStatus: "expired",
      actions: ["list_repos"],
      help: "GitHub connection expired; reconnect the provider account before running actions.",
    }]);
  });

  it("does not advertise actions when the installed integration package cannot load", async () => {
    resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ integration_id: "github", status: "active" }]);
    getIntegrationActions.mockRejectedValueOnce(new Error("piece package unavailable"));

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();
    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    );

    expect(result).toEqual([{
      id: "github",
      name: "GitHub",
      description: "GitHub API",
      connected: true,
      connectionStatus: "active",
      actions: [],
      help: "GitHub is connected, but no supported actions could be loaded right now.",
    }]);
  });

  it("returns no capabilities when plan entitlement resolution fails", async () => {
    resolveOrgPlanLimits.mockRejectedValueOnce(new Error("database unavailable"));

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", userId: "user-1", surface: "chat" } as never,
    );

    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not expose a cross-tenant agent grant", async () => {
    resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ integration_id: "github" }]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-from-org-2", userId: "user-1", surface: "chat" } as never,
    );

    expect(result).toEqual([]);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("a.org_id = $2"),
      ["agent-from-org-2", "org-1"],
    );
    expect(query).not.toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("(user_id = $3 OR user_id IS NULL)"),
      expect.anything(),
    );
  });

  it("does not report another user's connection as current-user readiness", async () => {
    resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
    query
      .mockResolvedValueOnce([{ integration_id: "github", enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { buildIntegrationAvailabilityTool } = await import("./integration-ai-tools");
    const tool = buildIntegrationAvailabilityTool();

    const result = await tool.execute(
      {},
      { tenantId: "org-1", agentId: "agent-1", userId: "user-2", surface: "chat" } as never,
    );

    expect(result).toEqual([
      {
        id: "github",
        name: "GitHub",
        description: "GitHub API",
        connected: false,
        connectionStatus: "disconnected",
        actions: ["list_repos"],
        help: "GitHub is enabled for this agent but still needs credentials connected.",
      },
    ]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("(user_id = $3 OR user_id IS NULL)"),
      ["org-1", "agent-1", "user-2"],
    );
  });

});
