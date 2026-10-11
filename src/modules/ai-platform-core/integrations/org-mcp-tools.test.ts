import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: vi.fn(),
}));

vi.mock("@/lib/plan-guard", () => ({}));

vi.mock("@/lib/secrets", () => ({
  ENCRYPTION_KEY: "test-encryption-key-32-chars-long!!",
}));

const { isMcpEnabledMock } = vi.hoisted(() => ({
  isMcpEnabledMock: vi.fn().mockReturnValue(true),
}));

vi.mock("../mcp-tool-bridge", async (importOriginal) => {
  const original = await importOriginal<typeof import("../mcp-tool-bridge")>();
  return { ...original, isMcpEnabled: isMcpEnabledMock };
});

import { buildMcpAvailabilityTool, buildMcpToolInvoker } from "./org-mcp-tools";
import type { PlatformExecutionContext } from "../contracts";
import { createExecutionContext } from "../execution-context";

function context(surface: "chat" | "realtime" | "embed"): PlatformExecutionContext {
  return createExecutionContext({
    orgId: "11111111-1111-1111-1111-111111111111",
    kbId: "22222222-2222-2222-2222-222222222222",
    agentId: "33333333-3333-3333-3333-333333333333",
    userId: "44444444-4444-4444-4444-444444444444",
    surface,
  });
}

const GLOBAL_ON = {
  mcp_enabled: true,
  emergency_disabled: false,
  security_policy: {
    requireHttps: true,
    blockPrivateNetworks: true,
    maxRedirects: 0,
    requestTimeoutMs: 15000,
    tlsVerify: true,
  },
  platform_catalog_enabled: true,
  clara_hosted_enabled: false,
};

const PRO_SUBSCRIPTION = {
  plan_id: "pro",
  plan_name: "Pro",
  status: "active",
  current_period_start: "2026-10-01T00:00:00Z",
  current_period_end: "2099-01-01T00:00:00Z",
  mcp_entitlements: {
    enabled: true,
    customEndpoints: true,
    maxConnections: 10,
    maxToolsPerConnection: 100,
    maxAgentAssignments: 500,
    toolCallsPerPeriod: 100_000,
    toolCallsPerMinute: 120,
    allowedAuthMethods: ["none", "bearer_token"],
    allowedTransports: ["streamable_http"],
    platformCatalog: true,
    privateNetwork: false,
    usagePolicy: "deny",
    notes: "",
  },
};

/** Route mocked queries the way the real database would answer them. */
function stubQueries(rows: Record<string, unknown[]>): void {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
    if (sql.includes("FROM org_subscriptions")) return [PRO_SUBSCRIPTION];
    if (sql.includes("FROM org_mcp_overrides")) return [];
    for (const [needle, value] of Object.entries(rows)) {
      if (sql.includes(needle)) return value;
    }
    return [];
  });
}

beforeEach(() => {
  queryMock.mockReset();
  isMcpEnabledMock.mockReturnValue(true);
});

describe("mcp_availability — advertisement", () => {
  it("advertises only active-connection approved granted tools", async () => {
    stubQueries({
      "FROM org_mcp_agent_grants": [
        {
          connection_id: "c1",
          connection_name: "acme",
          connection_status: "active",
          tool_id: "t1",
          tool_name: "search",
          description: "search things",
          input_schema: { type: "object" },
        },
      ],
    });
    const tool = buildMcpAvailabilityTool();
    const result = (await tool.execute({}, context("chat"))) as {
      tools: Array<{ toolId: string; name: string }>;
    };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({ toolId: "t1", name: "search" });
    // The advertisement query itself enforces the security boundary.
    const advertisementSql = queryMock.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes("FROM org_mcp_agent_grants"));
    expect(advertisementSql).toContain("g.enabled = TRUE");
    expect(advertisementSql).toContain("t.approved = TRUE");
    expect(advertisementSql).toContain("t.status = 'approved'");
    expect(advertisementSql).toContain("c.status = 'active'");
  });

  it("fails closed when the ENABLE_MCP rollout flag is off", async () => {
    isMcpEnabledMock.mockReturnValue(false);
    const tool = buildMcpAvailabilityTool();
    await expect(tool.execute({}, context("chat"))).rejects.toMatchObject({
      code: "PLAN_NOT_ENTITLED",
    });
  });

  it("requires full runtime identity", async () => {
    const tool = buildMcpAvailabilityTool();
    const forged = { ...context("chat"), userId: undefined } as unknown as PlatformExecutionContext;
    await expect(tool.execute({}, forged)).rejects.toMatchObject({
      code: "MISSING_CONTEXT_IDENTITY",
    });
  });
});

describe("mcp_tool — invocation-time reauthorization", () => {
  it("denies when the agent grant is revoked", async () => {
    stubQueries({
      "LEFT JOIN org_mcp_agent_grants": [
      {
        connection_id: "c1",
        connection_status: "active",
        connection_endpoint: "https://mcp.example.com",
        connection_auth_type: "none",
        tool_name: "search",
        tool_approved: true,
        tool_status: "approved",
        grant_enabled: false,
      },
    ],
    });
    const tool = buildMcpToolInvoker();
    await expect(
      tool.execute({ toolId: "t1", args: {} }, context("chat")),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_VIOLATION" });
  });

  it("denies when the connection is disabled", async () => {
    stubQueries({
      "LEFT JOIN org_mcp_agent_grants": [
      {
        connection_id: "c1",
        connection_status: "disabled",
        connection_endpoint: "https://mcp.example.com",
        connection_auth_type: "none",
        tool_name: "search",
        tool_approved: true,
        tool_status: "approved",
        grant_enabled: true,
      },
    ],
    });
    const tool = buildMcpToolInvoker();
    await expect(
      tool.execute({ toolId: "t1", args: {} }, context("realtime")),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_VIOLATION" });
  });

  it("denies when the tool approval was revoked", async () => {
    stubQueries({
      "LEFT JOIN org_mcp_agent_grants": [
      {
        connection_id: "c1",
        connection_status: "active",
        connection_endpoint: "https://mcp.example.com",
        connection_auth_type: "none",
        tool_name: "search",
        tool_approved: false,
        tool_status: "revoked",
        grant_enabled: true,
      },
    ],
    });
    const tool = buildMcpToolInvoker();
    await expect(
      tool.execute({ toolId: "t1", args: {} }, context("chat")),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_VIOLATION" });
  });

  it("fails closed when the feature flag is off even with a valid grant", async () => {
    isMcpEnabledMock.mockReturnValue(false);
    const tool = buildMcpToolInvoker();
    await expect(
      tool.execute({ toolId: "t1", args: {} }, context("chat")),
    ).rejects.toMatchObject({ code: "PLAN_NOT_ENTITLED" });
  });

  it("uses the same authorization policy on chat and realtime surfaces", () => {
    const chat = buildMcpToolInvoker();
    const realtime = buildMcpToolInvoker();
    expect(chat.authorization).toEqual(realtime.authorization);
    expect(chat.authorization.allowedSurfaces).toEqual(["chat", "realtime", "embed"]);
    expect(chat.authorization.requireUserId).toBe(true);
  });
});
