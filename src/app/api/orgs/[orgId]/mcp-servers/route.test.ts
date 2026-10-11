import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const requireOrgPermissionMock = vi.fn();
const requireAgentPermissionMock = vi.fn();
const resolveOrgPlanLimitsMock = vi.fn();

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ query: queryMock, withTransaction: vi.fn(async (fn) => fn({ query: queryMock })) }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "unit-test-encryption-key" }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "user-a" } }),
  requireOrgPermission: requireOrgPermissionMock,
  requireAgentPermission: requireAgentPermissionMock,
}));
vi.mock("@/lib/plan-guard", () => ({ resolveOrgPlanLimits: resolveOrgPlanLimitsMock }));

/** Route a query by its SQL instead of sequenced once-values, so the tests
 *  stay deterministic no matter how many statements each action runs. */
function stubQueries(routes: Array<{ match: string; rows: unknown[] }>) {
  queryMock.mockImplementation(async (sql: string) => {
    for (const route of routes) {
      if (typeof sql === "string" && sql.includes(route.match)) return route.rows;
    }
    return [];
  });
}

describe("organisation MCP server isolation and credential contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgPermissionMock.mockResolvedValue(undefined);
    requireAgentPermissionMock.mockResolvedValue({ orgId: "org-a" });
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "pro" });
  });

  it("scopes the server connection and tool grants to the requested organisation", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers s", rows: [{
        id: "server-1", serverKey: "safe-server", displayName: "Safe server",
        allowedPlans: ["pro"], connectionStatus: "configured",
        tools: [{ name: "search", approved: true, organisationEnabled: true, agentEnabled: false }],
      }] },
    ]);
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers"), {
      params: Promise.resolve({ orgId: "org-a" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(requireOrgPermissionMock).toHaveBeenCalledWith(expect.anything(), "org-a", "config:read");
    const serverQuery = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("FROM platform_mcp_servers"));
    expect(serverQuery?.[1]).toEqual(["org-a", null]);
    expect(JSON.stringify(body)).not.toContain("credentials_encrypted");
    expect(JSON.stringify(body)).not.toContain("bearerToken");
    expect(JSON.stringify(body)).not.toContain("platform_credential");
  });

  it("rejects agent grants when the target agent belongs to another organisation", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers WHERE id", rows: [{ id: "server-1", auth_mode: "none", allowed_plans: ["pro"], platform_enabled: true, platform_credential: null }] },
      { match: "FROM platform_mcp_tools", rows: [{ tool_name: "search", approved: true }] },
    ]);
    requireAgentPermissionMock.mockResolvedValueOnce({ orgId: "org-b" });
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serverId: "11111111-1111-4111-8111-111111111111", action: "grant-agent-tool",
        agentId: "22222222-2222-4222-8222-222222222222", toolName: "search", enabled: true,
      }),
    }), { params: Promise.resolve({ orgId: "org-a" }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Agent does not belong to this organisation" });
  });

  it("never returns bearer credentials after saving an organisation connection", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers WHERE id", rows: [{
        id: "11111111-1111-4111-8111-111111111111", auth_mode: "bearer",
        allowed_plans: ["pro"], platform_enabled: true, platform_credential: null,
      }] },
    ]);
    const { POST } = await import("./route");
    const token = "private-test-bearer-token";
    const response = await POST(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serverId: "11111111-1111-4111-8111-111111111111", action: "connect",
        credentials: { bearerToken: token },
      }),
    }), { params: Promise.resolve({ orgId: "org-a" }) });
    expect(response.status).toBe(201);
    expect(JSON.stringify(await response.json())).not.toContain(token);
    const insert = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("pgp_sym_encrypt"));
    expect(insert?.[0]).toContain("pgp_sym_encrypt");
    // The token is passed inside the encrypted JSON payload, never as a bare value.
    expect(JSON.stringify(insert?.[1])).toContain(token);
  });

  it("connects OAuth servers platform-managed, without any tenant token", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers WHERE id", rows: [{
        id: "11111111-1111-4111-8111-111111111111", auth_mode: "oauth",
        allowed_plans: ["pro"], platform_enabled: true,
        platform_credential: JSON.stringify({ type: "oauth", accessToken: "at", refreshToken: "rt", expiresAt: null, tokenType: "Bearer", scope: null, clientId: "clara", clientSecret: null, tokenEndpoint: "https://auth.example.com/token", resource: null }),
      }] },
    ]);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId: "11111111-1111-4111-8111-111111111111", action: "connect" }),
    }), { params: Promise.resolve({ orgId: "org-a" }) });
    expect(response.status).toBe(201);
    const insert = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("pgp_sym_encrypt"));
    // No tenant token: an empty credential object is stored and the runtime
    // falls back to the platform's OAuth credential.
    expect(insert?.[1]).toContain("{}");
    expect(JSON.stringify(insert?.[1])).not.toContain("accessToken");
  });

  it("refuses to connect OAuth servers whose platform sign-in is missing", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers WHERE id", rows: [{
        id: "11111111-1111-4111-8111-111111111111", auth_mode: "oauth",
        allowed_plans: ["pro"], platform_enabled: true, platform_credential: null,
      }] },
    ]);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId: "11111111-1111-4111-8111-111111111111", action: "connect" }),
    }), { params: Promise.resolve({ orgId: "org-a" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "MCP_OAUTH_NOT_CONNECTED" });
  });

  it("lets bearer servers fall back to the stored platform key when the org supplies none", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers WHERE id", rows: [{
        id: "11111111-1111-4111-8111-111111111111", auth_mode: "bearer",
        allowed_plans: ["pro"], platform_enabled: true,
        platform_credential: JSON.stringify({ type: "bearer", bearerToken: "platform-shared-key-1" }),
      }] },
    ]);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId: "11111111-1111-4111-8111-111111111111", action: "connect" }),
    }), { params: Promise.resolve({ orgId: "org-a" }) });
    expect(response.status).toBe(201);
    const insert = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("pgp_sym_encrypt"));
    expect(insert?.[1]).toContain("{}");
  });

  it("still requires a token for bearer servers with no platform key", async () => {
    stubQueries([
      { match: "FROM platform_mcp_servers WHERE id", rows: [{
        id: "11111111-1111-4111-8111-111111111111", auth_mode: "bearer",
        allowed_plans: ["pro"], platform_enabled: true, platform_credential: null,
      }] },
    ]);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/orgs/org-a/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId: "11111111-1111-4111-8111-111111111111", action: "connect" }),
    }), { params: Promise.resolve({ orgId: "org-a" }) });
    expect(response.status).toBe(400);
  });
});
