import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const resolveOrgPlanLimitsMock = vi.fn();
const getOrgPlanLimitsMock = vi.fn();

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
  requireAgentPermission: vi.fn().mockResolvedValue({ orgId: "org-1" }),
}));

vi.mock("@/modules/integrations/registry", () => ({
  listIntegrations: vi.fn().mockReturnValue([
    { id: "github", displayName: "GitHub" },
    { id: "slack", displayName: "Slack" },
    { id: "jira", displayName: "Jira" },
  ]),
}));

vi.mock("@/lib/plan-guard", () => ({
  resolveOrgPlanLimits: resolveOrgPlanLimitsMock,
  getOrgPlanLimits: getOrgPlanLimitsMock,
}));

describe("agent integration entitlement enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ enabled: true }]);
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "free" });
  });

  it("rejects an agent integration grant when the organisation plan is no longer entitled", async () => {
    const { PATCH } = await import("./route");

    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: true }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "The free plan cannot use this integration",
      code: "PLAN_NOT_ENTITLED",
    });
    expect(resolveOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the platform plan allowlist is malformed", async () => {
    queryMock
      .mockReset()
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: null }])
      .mockResolvedValueOnce([{ enabled: true }]);
    resolveOrgPlanLimitsMock.mockResolvedValue({ plan_id: "pro" });

    const { PATCH } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: true }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      error: "The pro plan cannot use this integration",
      code: "PLAN_NOT_ENTITLED",
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when authoritative plan resolution is unavailable", async () => {
    resolveOrgPlanLimitsMock.mockRejectedValueOnce(new Error("plan lookup failed"));

    const { PATCH } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: true }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Integration plan entitlement could not be verified",
    });
    expect(resolveOrgPlanLimitsMock).toHaveBeenCalledWith("org-1");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("allows disabling an existing grant after a plan downgrade", async () => {
    queryMock
      .mockReset()
      .mockResolvedValueOnce([{ enabled: true, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([]);

    const { PATCH } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: false }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      integrationId: "github",
      enabled: false,
    });
    expect(resolveOrgPlanLimitsMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("still allows revoking an agent grant after the platform or organisation disables the integration", async () => {
    queryMock
      .mockReset()
      .mockResolvedValueOnce([{ enabled: false, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ enabled: false }])
      .mockResolvedValueOnce([]);

    const { PATCH } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: false }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      integrationId: "github",
      enabled: false,
    });
    expect(resolveOrgPlanLimitsMock).not.toHaveBeenCalled();
  });

  it("rejects enabling an agent grant when the platform integration is disabled", async () => {
    queryMock
      .mockReset()
      .mockResolvedValueOnce([{ enabled: false, allowed_plans: ["pro"] }])
      .mockResolvedValueOnce([{ enabled: true }]);

    const { PATCH } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: "github", enabled: true }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Integration is not enabled for this organisation",
      code: "INTEGRATION_NOT_AVAILABLE",
    });
    expect(resolveOrgPlanLimitsMock).not.toHaveBeenCalled();
  });
});

describe("agent integration catalogue visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrgPlanLimitsMock.mockResolvedValue({ plan_id: "pro" });
  });

  // Promise.all query order: agent_integrations, organisation_integrations,
  // integration_connections, platform_integrations.
  function seedCatalogue({
    agent = [],
    org = [],
    connections = [],
    platform = [],
  }: {
    agent?: Array<{ integration_id: string; enabled: boolean }>;
    org?: Array<{ integration_id: string; enabled: boolean }>;
    connections?: Array<{
      integration_id: string;
      active_count: number;
      expired_count?: number;
      error_count?: number;
      revoked_count?: number;
      last_updated_at?: Date | null;
    }>;
    platform?: Array<{ integration_id: string; enabled: boolean; allowed_plans: string[] }>;
  }) {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce(agent)
      .mockResolvedValueOnce(org)
      .mockResolvedValueOnce(connections.map(c => ({
        active_count: c.active_count,
        expired_count: c.expired_count ?? 0,
        error_count: c.error_count ?? 0,
        revoked_count: c.revoked_count ?? 0,
        last_updated_at: c.last_updated_at ?? null,
        integration_id: c.integration_id,
      })))
      .mockResolvedValueOnce(platform);
  }

  it("lists platform-enabled integrations and hides the rest of the catalogue", async () => {
    seedCatalogue({
      platform: [
        { integration_id: "github", enabled: true, allowed_plans: ["pro", "enterprise"] },
        { integration_id: "slack", enabled: false, allowed_plans: ["*"] },
      ],
    });

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations");
    const response = await GET(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan).toEqual({ id: "pro" });
    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0]).toMatchObject({
      id: "github",
      platformEnabled: true,
      planAllowed: true,
      organisationEnabled: false,
      agentEnabled: false,
      connected: false,
    });
  });

  it("keeps organisation- and agent-granted integrations visible when platform-disabled so they can be revoked", async () => {
    seedCatalogue({
      agent: [{ integration_id: "jira", enabled: true }],
      org: [{ integration_id: "slack", enabled: true }],
      platform: [{ integration_id: "github", enabled: true, allowed_plans: ["free"] }],
    });

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations");
    const response = await GET(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.integrations.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(["github", "jira", "slack"]);
    const byId = new Map(body.integrations.map((i: { id: string }) => [i.id, i]));
    expect(byId.get("jira")).toMatchObject({ platformEnabled: false, agentEnabled: true });
    expect(byId.get("slack")).toMatchObject({ platformEnabled: false, organisationEnabled: true });
  });

  it("marks integrations as not plan-allowed when the current plan is missing from the allowlist", async () => {
    seedCatalogue({
      platform: [{ integration_id: "github", enabled: true, allowed_plans: ["enterprise"] }],
    });

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations");
    const response = await GET(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.integrations[0]).toMatchObject({ id: "github", platformEnabled: true, planAllowed: false });
  });

  it("reports per-integration connection status and recency for the direct-connect UX", async () => {
    const updatedAt = new Date("2026-10-01T10:00:00.000Z");
    seedCatalogue({
      org: [{ integration_id: "github", enabled: true }],
      connections: [
        { integration_id: "github", active_count: 1, last_updated_at: updatedAt },
        { integration_id: "slack", active_count: 0, expired_count: 1 },
        { integration_id: "jira", active_count: 0, revoked_count: 2 },
      ],
      platform: [
        { integration_id: "github", enabled: true, allowed_plans: ["pro"] },
        { integration_id: "slack", enabled: true, allowed_plans: ["pro"] },
        { integration_id: "jira", enabled: true, allowed_plans: ["pro"] },
      ],
    });

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations");
    const response = await GET(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const byId = new Map(body.integrations.map((i: { id: string }) => [i.id, i]));
    expect(byId.get("github")).toMatchObject({ connected: true, connectionStatus: "connected", connectionUpdatedAt: updatedAt.toISOString() });
    expect(byId.get("slack")).toMatchObject({ connected: false, connectionStatus: "expired" });
    expect(byId.get("jira")).toMatchObject({ connected: false, connectionStatus: "revoked" });
  });

  it("rejects a cross-organisation agent context", async () => {
    const { requireAgentPermission } = await import("@/modules/auth/core/rbac");
    vi.mocked(requireAgentPermission).mockResolvedValueOnce({ orgId: "org-other" } as Awaited<ReturnType<typeof requireAgentPermission>>);

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/orgs/org-1/agents/agent-1/integrations");
    const response = await GET(request, {
      params: Promise.resolve({ orgId: "org-1", agentId: "agent-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Agent does not belong to organisation" });
  });
});
