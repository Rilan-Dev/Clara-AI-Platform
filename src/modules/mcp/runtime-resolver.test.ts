import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  kbAccess: vi.fn(),
  resolveEntitlements: vi.fn(),
  invokeAdvertisedTool: vi.fn(),
  listAdvertised: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/modules/auth/core/db", () => ({
  getKbAccessContext: mocks.kbAccess,
}));
vi.mock("@/modules/mcp/entitlements", () => ({
  resolveEffectiveMcpEntitlements: mocks.resolveEntitlements,
}));
vi.mock("@/modules/mcp/service", () => ({
  invokeAdvertisedTool: mocks.invokeAdvertisedTool,
  listAdvertisedMcpTools: mocks.listAdvertised,
}));

import {
  OrgMcpToolResolver,
  createCompositeMcpResolver,
  resolveOrgOwnedMcpCapabilities,
} from "./runtime-resolver";
import { buildStoredMcpToolDescriptor } from "@/modules/ai-platform-core/mcp-streamable-http-resolver";
import { mcpToolName } from "@/modules/ai-platform-core/mcp-tool-bridge";
import type { PlatformExecutionContext } from "@/modules/ai-platform-core/contracts";

const ORG = "org-1";
const AGENT = "agent-1";
const KB = "kb-1";
const USER = "user-1";
const CONN = "11111111-2222-4333-8444-555555555555";

function context(overrides: Partial<PlatformExecutionContext> = {}): PlatformExecutionContext {
  return Object.freeze({
    tenantId: ORG,
    kbId: KB,
    userId: USER,
    agentId: AGENT,
    sessionId: "session-1",
    surface: "chat",
    ...overrides,
  });
}

function entitled(available: boolean) {
  return {
    available,
    denialReason: available ? null : "PLAN_NOT_ENTITLED",
    entitlements: {
      enabled: available,
      customEndpoints: available,
      maxConnections: 2,
      maxToolsPerConnection: 25,
      maxAgentAssignments: 50,
      toolCallsPerPeriod: 5000,
      toolCallsPerMinute: 30,
      allowedAuthMethods: ["none", "bearer_token"],
      allowedTransports: ["streamable_http"],
      platformCatalog: true,
      privateNetwork: false,
      usagePolicy: "deny",
      notes: "",
    },
    sources: {},
    planId: "starter",
    planName: "Starter",
    subscriptionStatus: "active",
    globalSettings: {
      mcpEnabled: true,
      emergencyDisabled: false,
      securityPolicy: {},
      platformCatalogEnabled: true,
      claraHostedEnabled: false,
    },
    override: null,
    periodStart: "2026-10-01",
  };
}

const TOOL_ROW = {
  tool_id: "tool-1",
  tool_name: "lookup",
  description: "Look up records",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENABLE_MCP", "true");
  mocks.kbAccess.mockResolvedValue([{
    orgId: ORG,
    membership: { id: "membership-1" },
    permissions: new Set(["kb:read"]),
  }]);
  mocks.resolveEntitlements.mockResolvedValue(entitled(true));
  mocks.query.mockResolvedValue([TOOL_ROW]);
});

describe("OrgMcpToolResolver.resolve", () => {
  it("fails closed when ENABLE_MCP is off", async () => {
    vi.stubEnv("ENABLE_MCP", "false");
    const resolver = new OrgMcpToolResolver();
    const descriptor = await resolver.resolve({
      serverId: CONN,
      toolName: "lookup",
      context: context(),
    });
    expect(descriptor).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("fails closed without full runtime identity", async () => {
    const resolver = new OrgMcpToolResolver();
    expect(await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context({ agentId: undefined }),
    })).toBeNull();
    expect(await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context({ userId: undefined }),
    })).toBeNull();
  });

  it("fails closed when the caller lost KB membership", async () => {
    mocks.kbAccess.mockResolvedValue([{
      orgId: ORG,
      membership: null,
      permissions: new Set(),
    }]);
    const resolver = new OrgMcpToolResolver();
    expect(await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context(),
    })).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("fails closed when entitlement resolution denies MCP", async () => {
    mocks.resolveEntitlements.mockResolvedValue(entitled(false));
    const resolver = new OrgMcpToolResolver();
    expect(await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context(),
    })).toBeNull();
    // Entitlement resolution must not be repeated per tool within a request scope.
    expect(mocks.resolveEntitlements).toHaveBeenCalledTimes(1);
  });

  it("returns a runtime-safe descriptor for an entitled granted tool", async () => {
    const resolver = new OrgMcpToolResolver();
    const descriptor = await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context(),
    });
    expect(descriptor).not.toBeNull();
    expect(descriptor!.serverId).toBe(CONN);
    expect(descriptor!.name).toBe("lookup");
    expect(descriptor!.description).toContain("untrusted metadata");
    expect(descriptor!.allowedSurfaces).toEqual(["chat", "realtime", "embed"]);
    // The grant query must scope tenant, agent AND the KB the chat session uses.
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("g.org_id = $1 AND g.agent_id = $2"),
      [ORG, AGENT, KB, CONN, "lookup"],
    );
    // Schema must be provider-safe: additionalProperties stripped to false.
    expect(descriptor!.inputSchemaJson).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    });
  });

  it("fails closed on a stored schema the runtime cannot normalize", async () => {
    mocks.query.mockResolvedValue([{
      ...TOOL_ROW,
      input_schema: { type: "object", properties: { a: { type: "string" } }, additionalProperties: true },
    }]);
    const resolver = new OrgMcpToolResolver();
    expect(await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context(),
    })).toBeNull();
  });

  it("fails closed when the store query throws", async () => {
    mocks.query.mockRejectedValue(new Error("db down"));
    const resolver = new OrgMcpToolResolver();
    expect(await resolver.resolve({
      serverId: CONN, toolName: "lookup", context: context(),
    })).toBeNull();
  });
});

describe("OrgMcpToolResolver.invoke", () => {
  function descriptorFor(schema: Record<string, unknown>) {
    return buildStoredMcpToolDescriptor(CONN, "lookup", "Look up records", schema, ["chat", "realtime", "embed"])!;
  }

  it("delegates to invokeAdvertisedTool with reauthorization and returns its content", async () => {
    mocks.query.mockResolvedValue([{ tool_id: "tool-9" }]);
    mocks.invokeAdvertisedTool.mockResolvedValue({
      ok: true,
      content: [{ type: "text", text: "done" }],
      structuredContent: { done: true },
      isError: false,
    });
    const resolver = new OrgMcpToolResolver();
    const descriptor = descriptorFor(TOOL_ROW.input_schema);
    const result = await resolver.invoke(descriptor, { query: "x" }, context({ surface: "realtime" }));
    expect(mocks.invokeAdvertisedTool).toHaveBeenCalledWith({
      orgId: ORG,
      agentId: AGENT,
      userId: USER,
      surface: "realtime",
      toolId: "tool-9",
      args: { query: "x" },
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "done" }],
      structuredContent: { done: true },
      isError: false,
    });
  });

  it("rejects arguments that do not match the approved schema", async () => {
    const resolver = new OrgMcpToolResolver();
    const descriptor = descriptorFor(TOOL_ROW.input_schema);
    await expect(
      resolver.invoke(descriptor, { query: 42 }, context()),
    ).rejects.toThrow("approved schema");
    expect(mocks.invokeAdvertisedTool).not.toHaveBeenCalled();
  });

  it("throws a sanitized error when reauthorization denies the invocation", async () => {
    mocks.query.mockResolvedValue([{ tool_id: "tool-9" }]);
    mocks.invokeAdvertisedTool.mockResolvedValue({
      ok: false,
      code: "PERMISSION_REVOKED",
      message: "This MCP tool is no longer available to this agent.",
      retryable: false,
    });
    const resolver = new OrgMcpToolResolver();
    const descriptor = descriptorFor(TOOL_ROW.input_schema);
    await expect(
      resolver.invoke(descriptor, { query: "x" }, context()),
    ).rejects.toThrow("failed safely");
    expect(mocks.invokeAdvertisedTool).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the tool row cannot be resolved at invocation time", async () => {
    mocks.query.mockResolvedValue([]);
    const resolver = new OrgMcpToolResolver();
    const descriptor = descriptorFor(TOOL_ROW.input_schema);
    await expect(
      resolver.invoke(descriptor, { query: "x" }, context()),
    ).rejects.toThrow("failed safely");
    expect(mocks.invokeAdvertisedTool).not.toHaveBeenCalled();
  });
});

describe("createCompositeMcpResolver", () => {
  it("routes resolution and invocation by the org-owned server-id set", async () => {
    const platformResolve = vi.fn().mockResolvedValue({ serverId: "platform-1", name: "p" });
    const platformInvoke = vi.fn().mockResolvedValue({ from: "platform" });
    const orgResolve = vi.fn().mockResolvedValue({ serverId: CONN, name: "lookup" });
    const orgInvoke = vi.fn().mockResolvedValue({ from: "org" });
    const composite = createCompositeMcpResolver({
      platform: { resolve: platformResolve, invoke: platformInvoke },
      orgOwned: { resolve: orgResolve, invoke: orgInvoke },
      orgOwnedServerIds: new Set([CONN]),
    });
    const ctx = context();
    await composite.resolve({ serverId: "platform-1", toolName: "p", context: ctx });
    await composite.resolve({ serverId: CONN, toolName: "lookup", context: ctx });
    expect(platformResolve).toHaveBeenCalledTimes(1);
    expect(orgResolve).toHaveBeenCalledTimes(1);
    await composite.invoke({ serverId: "platform-1", name: "p" } as never, {}, ctx);
    await composite.invoke({ serverId: CONN, name: "lookup" } as never, {}, ctx);
    expect(platformInvoke).toHaveBeenCalledTimes(1);
    expect(orgInvoke).toHaveBeenCalledTimes(1);
  });
});

describe("resolveOrgOwnedMcpCapabilities", () => {
  it("advertises only resolvable org-owned tools with matching aliases and policy", async () => {
    mocks.listAdvertised.mockResolvedValue([
      { connectionId: CONN, connectionName: "CRM", connectionStatus: "active", toolId: "tool-1", toolName: "lookup", description: "Look up records", inputSchema: TOOL_ROW.input_schema },
      { connectionId: CONN, connectionName: "CRM", connectionStatus: "active", toolId: "tool-2", toolName: "delete_everything", description: "Nope", inputSchema: { type: "object", properties: {}, additionalProperties: true } },
    ]);
    // Only the "lookup" tool resolves; the non-normalizable one is dropped.
    mocks.query.mockResolvedValueOnce([TOOL_ROW]).mockResolvedValueOnce([]);

    const ctx = context();
    const capabilities = await resolveOrgOwnedMcpCapabilities(ctx);

    expect(capabilities.requests).toHaveLength(1);
    expect(capabilities.requests[0]!.serverId).toBe(CONN);
    expect(capabilities.requests[0]!.toolName).toBe("lookup");
    expect(capabilities.allowedServers).toEqual([CONN]);
    expect(capabilities.allowedToolPairs).toEqual([{ serverId: CONN, toolName: "lookup" }]);
    expect(capabilities.tools).toHaveLength(1);
    expect(capabilities.tools[0]!.name).toBe(mcpToolName(CONN, "lookup"));
    expect(capabilities.tools[0]!.parameters.additionalProperties).toBe(false);
  });

  it("returns empty capabilities while ENABLE_MCP is off", async () => {
    vi.stubEnv("ENABLE_MCP", "false");
    const capabilities = await resolveOrgOwnedMcpCapabilities(context());
    expect(capabilities.requests).toEqual([]);
    expect(capabilities.tools).toEqual([]);
    expect(mocks.listAdvertised).not.toHaveBeenCalled();
  });
});
