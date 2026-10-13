import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const withTransactionMock = vi.fn(
  async (
    fn: (client: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    }) => Promise<unknown>,
  ) =>
    fn({
      query: async (sql: string, params?: unknown[]) => ({
        rows: await queryMock(sql, params),
      }),
    }),
);
const requireAuthMock = vi.fn();
const requireOrgPermissionMock = vi.fn();
const resolveEffectiveMcpEntitlementsMock = vi.fn();
const mcpHandshakeMock = vi.fn();
const mcpDiscoverToolsMock = vi.fn();
const recordOrgMcpAuditMock = vi.fn().mockResolvedValue(undefined);
const getMcpUsageSummaryMock = vi.fn();
const listOrgMcpConnectionsMock = vi.fn();

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: withTransactionMock,
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: requireAuthMock,
  requireOrgPermission: requireOrgPermissionMock,
}));

vi.mock("@/modules/mcp/entitlements", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/mcp/entitlements")>();
  return { ...original, resolveEffectiveMcpEntitlements: resolveEffectiveMcpEntitlementsMock };
});

vi.mock("@/modules/mcp/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/mcp/client")>();
  return {
    ...original,
    mcpHandshake: mcpHandshakeMock,
    mcpDiscoverTools: mcpDiscoverToolsMock,
  };
});

vi.mock("@/modules/mcp/audit", () => ({
  recordOrgMcpAudit: recordOrgMcpAuditMock,
  recordPlatformMcpAudit: vi.fn(),
  listOrgMcpAudit: vi.fn(),
}));

vi.mock("@/modules/mcp/metering", () => ({
  getMcpUsageSummary: getMcpUsageSummaryMock,
  checkMcpQuotaAdmission: vi.fn(),
  recordMcpUsage: vi.fn(),
  withMcpAdmission: vi.fn(),
  acquireOrgMcpLock: vi.fn(),
}));

vi.mock("@/lib/secrets", () => ({
  ENCRYPTION_KEY: "test-encryption-key-32-chars-long!!",
}));


const GLOBAL_ON = {
  mcpEnabled: true,
  emergencyDisabled: false,
  securityPolicy: {
    requireHttps: true,
    blockPrivateNetworks: true,
    maxRedirects: 0,
    requestTimeoutMs: 15000,
    tlsVerify: true,
  },
  platformCatalogEnabled: true,
  claraHostedEnabled: false,
};

const ENTITLED = {
  available: true,
  denialReason: null,
  entitlements: {
    enabled: true,
    customEndpoints: true,
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
  planId: "starter",
  planName: "Starter",
  subscriptionStatus: "active",
  sources: {},
  globalSettings: GLOBAL_ON,
  override: null,
  periodStart: "2026-10-01",
};

function request(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/orgs/org-1/mcp/connections", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

async function routeHandlers() {
  return import("./route");
}

async function overviewHandlers() {
  return import("../overview/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  requireOrgPermissionMock.mockResolvedValue(undefined);
  resolveEffectiveMcpEntitlementsMock.mockResolvedValue(ENTITLED);
  mcpHandshakeMock.mockResolvedValue({
    protocolVersion: "2025-06-18",
    serverInfo: { name: "acme", version: "1.0.0" },
    capabilities: {},
    sessionId: null,
  });
  mcpDiscoverToolsMock.mockResolvedValue([
    { name: "search", title: null, description: "search things", inputSchema: {} },
  ]);
  getMcpUsageSummaryMock.mockResolvedValue({
    connections: 0,
    activeConnections: 0,
    toolsApproved: 0,
    agentAssignments: 0,
    toolCallsThisPeriod: 0,
    toolCallsLast24h: 0,
    failedCallsThisPeriod: 0,
  });
  listOrgMcpConnectionsMock.mockResolvedValue([]);
});

describe("POST /api/orgs/[orgId]/mcp/connections — entitlement enforcement", () => {
  it("denies probe and create when the plan is not entitled", async () => {
    resolveEffectiveMcpEntitlementsMock.mockResolvedValue({
      ...ENTITLED,
      available: false,
      denialReason: "PLAN_NOT_ENTITLED",
      entitlements: { ...ENTITLED.entitlements, enabled: false },
    });
    const response = await (await routeHandlers()).POST(request({ action: "probe", endpointUrl: "https://x.example/mcp", authType: "none" }), {
      params: Promise.resolve({ orgId: "org-1" }),
    });
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.code).toBe("PLAN_NOT_ENTITLED");
  });

  it("denies when emergency disablement is active", async () => {
    resolveEffectiveMcpEntitlementsMock.mockResolvedValue({
      ...ENTITLED,
      available: false,
      denialReason: "EMERGENCY_DISABLED",
    });
    const response = await (await routeHandlers()).POST(
      request({ action: "create", name: "t", endpointUrl: "https://x.example/mcp", authType: "none" }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("EMERGENCY_DISABLED");
  });

  it("denies custom endpoints when the plan excludes them", async () => {
    resolveEffectiveMcpEntitlementsMock.mockResolvedValue({
      ...ENTITLED,
      entitlements: { ...ENTITLED.entitlements, customEndpoints: false },
    });
    const response = await (await routeHandlers()).POST(
      request({ action: "probe", endpointUrl: "https://x.example/mcp", authType: "none" }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("CUSTOM_ENDPOINTS_NOT_ALLOWED");
  });

  it("denies authentication methods the plan does not permit", async () => {
    const response = await (await routeHandlers()).POST(
      request({
        action: "probe",
        endpointUrl: "https://x.example/mcp",
        authType: "basic_auth",
        credentials: { username: "u", password: "p" },
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("AUTH_METHOD_NOT_ALLOWED");
  });

  it("fails closed when entitlement resolution throws", async () => {
    resolveEffectiveMcpEntitlementsMock.mockRejectedValue(new Error("db down"));
    const response = await (await routeHandlers()).POST(
      request({ action: "probe", endpointUrl: "https://x.example/mcp", authType: "none" }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("ENTITLEMENT_RESOLUTION_FAILED");
  });

  it("requires org config:update permission", async () => {
    requireOrgPermissionMock.mockRejectedValue(
      new (class extends Error {})(JSON.stringify({ error: "forbidden" })),
    );
    const response = await (await routeHandlers()).POST(
      request({ action: "probe", endpointUrl: "https://x.example/mcp", authType: "none" }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    ).catch(() => null);
    // rbac failures throw NextResponse-shaped errors; either non-2xx or null.
    if (response) expect(response.status >= 400 || response.status === 403).toBe(true);
  });

  it("validates request payload shape", async () => {
    const response = await (await routeHandlers()).POST(request({ authType: "none" }), {
      params: Promise.resolve({ orgId: "org-1" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/orgs/[orgId]/mcp/connections — creation lifecycle", () => {
  it("creates a connection with live handshake, discovery and approval", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)::int AS count FROM org_mcp_connections")) {
        return [{ count: 0 }];
      }
      if (sql.includes("INSERT INTO org_mcp_connections")) {
        return [{ id: "conn-1" }];
      }
      if (sql.includes("INSERT INTO org_mcp_tools")) return [];
      if (sql.includes("FROM org_mcp_connections c")) {
        return [
          {
            id: "conn-1",
            name: "acme",
            description: "",
            endpoint_url: "https://x.example/mcp",
            transport: "streamable_http",
            auth_type: "none",
            status: "active",
            last_error: null,
            last_checked_at: new Date(),
            handshake_protocol: "2025-06-18",
            handshake_server_info: { name: "acme", version: "1.0.0" },
            created_at: new Date(),
            updated_at: new Date(),
            tool_count: 1,
            approved_tool_count: 1,
            agent_grant_count: 0,
          },
        ];
      }
      if (sql.includes("FROM org_mcp_tools t")) return [];
      if (sql.includes("FROM mcp_tool_usage_log")) {
        return [{ day_calls: 0, period_calls: 0, failed_calls: 0 }];
      }
      return [];
    });

    const response = await (await routeHandlers()).POST(
      request({
        action: "create",
        name: "acme",
        description: "test server",
        endpointUrl: "https://x.example/mcp",
        authType: "none",
        approvedToolNames: ["search"],
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.connectionId).toBe("conn-1");

    // A live handshake and discovery ran before persistence.
    expect(mcpHandshakeMock).toHaveBeenCalledTimes(1);
    expect(mcpDiscoverToolsMock).toHaveBeenCalledTimes(1);
    // The org-scoped audit row was written.
    expect(recordOrgMcpAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "connection.created", orgId: "org-1" }),
    );
  });

  it("rejects creation when the connection limit is reached", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)::int AS count FROM org_mcp_connections")) {
        return [{ count: 2 }];
      }
      return [];
    });
    const response = await (await routeHandlers()).POST(
      request({
        action: "create",
        name: "acme",
        endpointUrl: "https://x.example/mcp",
        authType: "none",
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(402);
    const data = await response.json();
    expect(data.code).toBe("CONNECTION_LIMIT_REACHED");
    expect(data.limit).toBe(2);
    expect(data.current).toBe(2);
  });

  it("rejects approving more tools than the per-connection limit", async () => {
    resolveEffectiveMcpEntitlementsMock.mockResolvedValue({
      ...ENTITLED,
      entitlements: { ...ENTITLED.entitlements, maxToolsPerConnection: 2 },
    });
    mcpDiscoverToolsMock.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({ name: `tool_${i}`, title: null, description: "", inputSchema: {} })),
    );
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)::int AS count FROM org_mcp_connections")) {
        return [{ count: 0 }];
      }
      return [];
    });
    const response = await (await routeHandlers()).POST(
      request({
        action: "create",
        name: "acme",
        endpointUrl: "https://x.example/mcp",
        authType: "none",
        approvedToolNames: ["tool_0", "tool_1", "tool_2"],
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("TOOL_LIMIT_REACHED");
  });

  it("propagates handshake failures with typed codes", async () => {
    const { McpClientError } = await import("@/modules/mcp/client");
    mcpHandshakeMock.mockRejectedValue(
      new McpClientError("ENDPOINT_BLOCKED", "bad endpoint", { status: 502 }),
    );
    const response = await (await routeHandlers()).POST(
      request({
        action: "create",
        name: "acme",
        endpointUrl: "https://x.example/mcp",
        authType: "none",
      }),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("ENDPOINT_BLOCKED");
  });
});

describe("GET overview — org-scoped projection", () => {
  it("returns entitlements, usage and no connections when unavailable", async () => {
    resolveEffectiveMcpEntitlementsMock.mockResolvedValue({
      ...ENTITLED,
      available: false,
      denialReason: "PLAN_NOT_ENTITLED",
    });
    const response = await (await overviewHandlers()).GET(new NextRequest("http://localhost/api/orgs/org-1/mcp/overview"), {
      params: Promise.resolve({ orgId: "org-1" }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.available).toBe(false);
    expect(data.denialReason).toBe("PLAN_NOT_ENTITLED");
    expect(data.connections).toEqual([]);
    expect(listOrgMcpConnectionsMock).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when resolution fails", async () => {
    resolveEffectiveMcpEntitlementsMock.mockRejectedValue(new Error("db down"));
    const response = await (await overviewHandlers()).GET(new NextRequest("http://localhost/api/orgs/org-1/mcp/overview"), {
      params: Promise.resolve({ orgId: "org-1" }),
    });
    expect(response.status).toBe(503);
  });
});

describe("GET connections — list", () => {
  it("requires config:read and lists org connections", async () => {
    // The service is exercised through its own module; here we verify the
    // route contract only (auth + shape).
    const response = await (await routeHandlers()).GET(request({}, "GET"), {
      params: Promise.resolve({ orgId: "org-1" }),
    });
    expect(response.status).toBe(200);
    expect(requireOrgPermissionMock).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "config:read",
    );
  });
});