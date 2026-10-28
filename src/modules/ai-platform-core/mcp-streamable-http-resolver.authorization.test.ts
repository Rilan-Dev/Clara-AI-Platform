import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "./execution-context";

const { queryMock, mcpHttpRequestMock, planMock, kbAccessMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  mcpHttpRequestMock: vi.fn(),
  planMock: vi.fn(),
  kbAccessMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key" }));
vi.mock("@/lib/plan-guard", () => ({ resolveOrgPlanLimits: planMock }));
vi.mock("@/modules/auth/core/db", () => ({ getKbAccessContext: kbAccessMock }));
vi.mock("./mcp-http-transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp-http-transport")>();
  return { ...actual, mcpHttpRequest: mcpHttpRequestMock };

  it("rejects invocation when the remote tool schema changes after discovery", async () => {
    const schema = (minimum: number) => ({
      type: "object",
      properties: { count: { type: "integer", minimum } },
      required: ["count"],
      additionalProperties: false,
    });
    const toolPage = (inputSchema: unknown) => rpc({
      tools: [{ name: "lookup", description: "Read one record", inputSchema }],
    });
    mcpHttpRequestMock.mockReset();
    mcpHttpRequestMock
      .mockResolvedValueOnce(rpc({ protocolVersion: "2025-03-26", serverInfo: { name: "mock", version: "1" } }))
      .mockResolvedValueOnce({ status: 202, headers: {}, body: "" })
      .mockResolvedValueOnce(toolPage(schema(1)))
      .mockResolvedValueOnce(rpc({ protocolVersion: "2025-03-26", serverInfo: { name: "mock", version: "1" } }))
      .mockResolvedValueOnce({ status: 202, headers: {}, body: "" })
      .mockResolvedValueOnce(toolPage(schema(2)));
    queryMock
      .mockResolvedValueOnce([serverAccess]) // initial discovery authorization
      .mockResolvedValueOnce([]) // connection status update
      .mockResolvedValueOnce([serverAccess]); // invocation authorization

    const resolver = new StreamableHttpMcpToolResolver();
    const descriptor = await resolver.resolve({
      serverId: "server-1",
      toolName: "lookup",
      context,
    });
    expect(descriptor).not.toBeNull();

    await expect(
      resolver.invoke(descriptor!, { count: 2 }, context),
    ).rejects.toThrow("MCP tool invocation failed safely.");
    // The changed schema is rejected before the side-effecting tools/call RPC.
    expect(mcpHttpRequestMock).toHaveBeenCalledTimes(6);
    expect(queryMock).toHaveBeenCalledTimes(3);
  });


  it("does not discover tools when the server is disabled or has no current platform approval", async () => {
    queryMock.mockResolvedValueOnce([]); // platform_enabled / approved-tool query returns no rows
    const resolver = new StreamableHttpMcpToolResolver();
    await expect(
      resolver.resolve({ serverId: "server-1", toolName: "lookup", context }),
    ).resolves.toBeNull();
    expect(mcpHttpRequestMock).not.toHaveBeenCalled();
  });

  it("does not discover tools when the server is not allowed for the current plan", async () => {
    queryMock.mockResolvedValueOnce([{ ...serverAccess, allowed_plans: ["starter"] }]);
    const resolver = new StreamableHttpMcpToolResolver();
    await expect(
      resolver.resolve({ serverId: "server-1", toolName: "lookup", context }),
    ).resolves.toBeNull();
    expect(mcpHttpRequestMock).not.toHaveBeenCalled();
  });

});

import { StreamableHttpMcpToolResolver } from "./mcp-streamable-http-resolver";

const serverAccess = {
  id: "server-1",
  endpoint_url: "https://mcp.vendor.com/mcp",
  auth_mode: "none",
  allowed_plans: ["pro"],
  tool_name: "lookup",
  allowed_surfaces: ["chat"],
  org_bearer_token: null,
  platform_credential: null,
  bearer_token: null,
};

const context = createExecutionContext({
  orgId: "org-1",
  kbId: "kb-1",
  agentId: "agent-1",
  userId: "user-1",
  sessionId: "session-1",
  surface: "chat",
});

function rpc(result: unknown) {
  return { status: 200, headers: {}, body: JSON.stringify({ jsonrpc: "2.0", id: "ignored-by-current-decoder", result }) };
}

describe("Streamable HTTP MCP authorization freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ENABLE_MCP", "true");
    planMock.mockResolvedValue({ plan_id: "pro" });
    kbAccessMock.mockResolvedValue([{
      orgId: "org-1",
      membership: { id: "membership-1" },
      permissions: new Set(["kb:read"]),
    }]);
    mcpHttpRequestMock
      .mockResolvedValueOnce(rpc({ protocolVersion: "2025-03-26", serverInfo: { name: "mock", version: "1" } }))
      .mockResolvedValueOnce({ status: 202, headers: {}, body: "" })
      .mockResolvedValueOnce(rpc({
        tools: [{
          name: "lookup",
          description: "Read one record",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
            additionalProperties: false,
          },
        }],
      }));
  });

  it("does not perform remote discovery or invocation after the organization grant is revoked", async () => {
    queryMock
      .mockResolvedValueOnce([serverAccess]) // discovery authorization query
      .mockResolvedValueOnce([]) // best-effort connection status update
      .mockResolvedValueOnce([]); // invocation authorization query: grant revoked

    const resolver = new StreamableHttpMcpToolResolver();
    const descriptor = await resolver.resolve({
      serverId: "server-1",
      toolName: "lookup",
      context,
    });
    expect(descriptor).not.toBeNull();
    expect(mcpHttpRequestMock).toHaveBeenCalledTimes(3);

    await expect(
      resolver.invoke(descriptor!, { id: "record-1" }, context),
    ).rejects.toThrow("MCP tool invocation failed safely.");

    // The revoked grant is rejected before the transport is contacted again.
    expect(mcpHttpRequestMock).toHaveBeenCalledTimes(3);
  });
});
