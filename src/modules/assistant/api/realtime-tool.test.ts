import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  kbAccess: vi.fn(),
  query: vi.fn(),
  createContext: vi.fn(),
  invoke: vi.fn(),
  agentLoopEnabled: vi.fn(() => true),
  toolCallingEnabled: vi.fn(() => true),
  mcpEnabled: vi.fn(() => false),
  buildRuntime: vi.fn(),
  orgResolverCtor: vi.fn(),
  orgResolve: vi.fn(),
  orgInvoke: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  getAuthContext: mocks.auth,
}));
vi.mock("@/modules/auth/core/db", () => ({
  getKbAccessContext: mocks.kbAccess,
}));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));
vi.mock("@/modules/mcp/runtime-resolver", () => ({
  OrgMcpToolResolver: mocks.orgResolverCtor,
}));
// Partially mock the platform barrel: keep the real deterministic
// mcpToolName/streamableHttpMcpToolResolver implementations so alias math in
// the source matches the aliases computed in these tests exactly.
vi.mock("@/modules/ai-platform-core", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/ai-platform-core")
  >();
  return {
    ...actual,
    createExecutionContext: mocks.createContext,
    getClaraToolRuntime: () => ({ invoke: mocks.invoke }),
    isAgentLoopEnabled: mocks.agentLoopEnabled,
    isProviderToolCallingEnabled: mocks.toolCallingEnabled,
    isMcpEnabled: mocks.mcpEnabled,
    buildMcpToolRuntime: mocks.buildRuntime,
  };
});

import { postRealtimeTool } from "./realtime-tool";
import { mcpToolName } from "@/modules/ai-platform-core/mcp-tool-bridge";

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/realtime/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.agentLoopEnabled.mockReturnValue(true);
  mocks.toolCallingEnabled.mockReturnValue(true);
  mocks.mcpEnabled.mockReturnValue(false);
  mocks.auth.mockResolvedValue({
    user: { id: "user-server", isSuperAdmin: false },
    session: { id: "session-server" },
  });
  mocks.kbAccess.mockResolvedValue([{
    orgId: "org-server",
    membership: { id: "membership-server" },
    permissions: new Set(["kb:read"]),
  }]);
  mocks.query.mockResolvedValue([{ agent_id: "agent-server" }]);
  mocks.createContext.mockReturnValue({
    tenantId: "org-server",
    kbId: "kb-server",
    agentId: "agent-server",
    userId: "user-server",
    sessionId: "session-server",
    surface: "realtime",
  });
  mocks.invoke.mockResolvedValue({
    ok: true,
    toolName: "integration_availability",
    data: [{ id: "gmail", connected: true }],
  });
  mocks.orgResolverCtor.mockImplementation(() => ({
    resolve: mocks.orgResolve,
    invoke: mocks.orgInvoke,
  }));
  mocks.buildRuntime.mockResolvedValue(null);
});

describe("postRealtimeTool", () => {
  it("fails closed when the rollout flags are disabled", async () => {
    mocks.agentLoopEnabled.mockReturnValue(false);
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "integration_availability",
      arguments: {},
    }));
    expect(response.status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("requires authentication before tool execution", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "integration_availability",
      arguments: {},
    }));
    expect(response.status).toBe(401);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects tools outside the fixed realtime integration allowlist", async () => {
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "rag_search",
      arguments: { query: "hello" },
    }));
    expect(response.status).toBe(400);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects MCP-shaped tool names while ENABLE_MCP is off", async () => {
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "mcp_something_lookup_ab12cd34",
      arguments: {},
    }));
    expect(response.status).toBe(400);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.buildRuntime).not.toHaveBeenCalled();
  });

  it("derives tenant, agent, user, and session from server state and delegates to the Unified Tool Runtime", async () => {
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "integration_availability",
      arguments: { integrationId: "gmail" },
      orgId: "forged-org",
      agentId: "forged-agent",
      userId: "forged-user",
      sessionId: "forged-session",
    }));
    expect(response.status).toBe(200);
    expect(mocks.kbAccess).toHaveBeenCalledWith("kb-server", "user-server");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("a.org_id = $2"), ["kb-server", "org-server"]);
    expect(mocks.createContext).toHaveBeenCalledWith({
      orgId: "org-server",
      kbId: "kb-server",
      agentId: "agent-server",
      userId: "user-server",
      sessionId: "session-server",
      surface: "realtime",
      metadata: expect.objectContaining({ mcpSignal: expect.anything() }),
    });
    expect(mocks.invoke).toHaveBeenCalledWith(
      "integration_availability",
      { integrationId: "gmail" },
      expect.objectContaining({ tenantId: "org-server", userId: "user-server" }),
    );
    expect(await response.json()).toEqual({
      outcome: {
        ok: true,
        toolName: "integration_availability",
        data: [{ id: "gmail", connected: true }],
      },
    });
  });

  it("denies a caller without KB membership/read permission", async () => {
    mocks.kbAccess.mockResolvedValue([{
      orgId: "org-server",
      membership: null,
      permissions: new Set(),
    }]);
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "integration_action",
      arguments: { integrationId: "gmail", actionName: "send_email", props: {} },
    }));
    expect(response.status).toBe(403);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("rejects MCP aliases that match no current grant", async () => {
    mocks.mcpEnabled.mockReturnValue(true);
    mocks.query
      .mockResolvedValueOnce([{ agent_id: "agent-server" }]) // agent lookup
      .mockResolvedValueOnce([]) // platform-catalog grants
      .mockResolvedValueOnce([]); // org-owned grants
    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: "mcp_00000000_0000_4000_8000_000000000000_lookup_ab12cd34",
      arguments: {},
    }));
    expect(response.status).toBe(403);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.buildRuntime).not.toHaveBeenCalled();
  });

  it("dispatches an org-owned MCP alias through the OrgMcpToolResolver runtime", async () => {
    mocks.mcpEnabled.mockReturnValue(true);
    const connectionId = "11111111-2222-4333-8444-555555555555";
    const toolName = "lookup";
    const alias = mcpToolName(connectionId, toolName);
    const runtimeInvoke = vi.fn().mockResolvedValue({ ok: true, toolName: alias, data: { result: "ok" } });
    mocks.query
      .mockResolvedValueOnce([{ agent_id: "agent-server" }]) // agent lookup
      .mockResolvedValueOnce([]) // platform-catalog grants: none
      .mockResolvedValueOnce([{ connection_id: connectionId, tool_name: toolName }]); // org-owned grant
    mocks.buildRuntime.mockResolvedValue({ invoke: runtimeInvoke });

    const response = await postRealtimeTool(request({
      kbId: "kb-server",
      toolName: alias,
      arguments: { query: "hello" },
    }));

    expect(response.status).toBe(200);
    // The one-tool runtime must be built with the org-owned resolver instance
    // (never the platform catalog resolver) and the exact pair allowlist.
    expect(mocks.orgResolverCtor).toHaveBeenCalledTimes(1);
    const resolverInstance = mocks.orgResolverCtor.mock.results[0]!.value;
    expect(mocks.buildRuntime).toHaveBeenCalledTimes(1);
    const [context, requests, policy, resolver] = mocks.buildRuntime.mock.calls[0]!;
    expect(context).toEqual(expect.objectContaining({ tenantId: "org-server", surface: "realtime" }));
    expect(requests).toEqual([
      { serverId: connectionId, toolName, context: expect.anything() },
    ]);
    expect(policy).toEqual({
      allowedServers: [connectionId],
      allowedToolPairs: [{ serverId: connectionId, toolName }],
    });
    expect(resolver).toBe(resolverInstance);
    expect(runtimeInvoke).toHaveBeenCalledWith(alias, { query: "hello" }, context);
    expect(await response.json()).toEqual({
      outcome: { ok: true, toolName: alias, data: { result: "ok" } },
    });
  });
});
