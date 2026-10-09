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
vi.mock("@/modules/ai-platform-core", () => ({
  createExecutionContext: mocks.createContext,
  getClaraToolRuntime: () => ({ invoke: mocks.invoke }),
  isAgentLoopEnabled: mocks.agentLoopEnabled,
  isProviderToolCallingEnabled: mocks.toolCallingEnabled,
}));

import { postRealtimeTool } from "./realtime-tool";

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
});
