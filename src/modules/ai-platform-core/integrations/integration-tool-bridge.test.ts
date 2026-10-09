import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformExecutionContext } from "../contracts";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveOrgPlanLimits: vi.fn(),
  getIntegration: vi.fn(),
  getIntegrationActions: vi.fn(),
  runAction: vi.fn(),
  buildClaraToolRuntime: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/plan-guard", () => ({ resolveOrgPlanLimits: mocks.resolveOrgPlanLimits }));
vi.mock("@/modules/integrations/registry", () => ({ getIntegration: mocks.getIntegration }));
vi.mock("@/modules/integrations/runtime/runner-core", () => ({
  getIntegrationActions: mocks.getIntegrationActions,
  runAction: mocks.runAction,
}));
vi.mock("../execution-context", () => ({ assertExecutionContext: vi.fn() }));
vi.mock("../clara-tools", () => ({ buildClaraToolRuntime: mocks.buildClaraToolRuntime }));

import { buildIntegrationToolBridgeAdapter } from "./integration-tool-bridge";

function context(overrides: Record<string, unknown> = {}): PlatformExecutionContext {
  return {
    tenantId: "org-1",
    kbId: "kb-1",
    agentId: "agent-1",
    userId: "user-1",
    sessionId: "session-1",
    surface: "chat",
    correlationId: "correlation-1",
    metadata: {},
    ...overrides,
  } as PlatformExecutionContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro", plan_name: "Pro" });
  mocks.getIntegration.mockReturnValue({
    id: "github",
    displayName: "GitHub",
    authType: "oauth2",
    actions: ["list_repositories"],
  });
  mocks.getIntegrationActions.mockResolvedValue([]);
});

describe("integration tool bridge identity boundary", () => {
  it("fails closed before querying grants when caller user identity is missing", async () => {
    const adapter = buildIntegrationToolBridgeAdapter();

    await expect(
      adapter.listToolDefinitions(context({ userId: undefined }), "github"),
    ).rejects.toMatchObject({
      code: "TENANT_SCOPE_VIOLATION",
      message: "Integration capability discovery requires tenant, agent, and user identity.",
    });

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getIntegration).not.toHaveBeenCalled();
  });

  it("fails closed before querying grants when agent identity is missing", async () => {
    const adapter = buildIntegrationToolBridgeAdapter();

    await expect(
      adapter.listToolDefinitions(context({ agentId: undefined }), "github"),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_VIOLATION" });

    expect(mocks.query).not.toHaveBeenCalled();
  });
});
