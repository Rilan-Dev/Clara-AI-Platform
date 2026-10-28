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
});

import { StreamableHttpMcpToolResolver } from "./mcp-streamable-http-resolver";

const serverAccess = {
  id: "server-1",
  endpoint_url: "https://mcp.vendor.test/mcp",
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
