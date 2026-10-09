import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireOrgPermission: vi.fn(),
  requireAgentPermission: vi.fn(),
  resolveOrgPlanLimits: vi.fn(),
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key" }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireOrgPermission: mocks.requireOrgPermission,
  requireAgentPermission: mocks.requireAgentPermission,
}));
vi.mock("@/lib/plan-guard", () => ({ resolveOrgPlanLimits: mocks.resolveOrgPlanLimits }));
vi.mock("@/modules/integrations/registry", () => ({ getIntegration: mocks.getIntegration }));

import { GET } from "./route";

function request() {
  return new NextRequest(
    "https://clara.example/api/orgs/org-1/integrations/gmail/oauth/start",
    { headers: { Accept: "application/json" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.requireOrgPermission.mockResolvedValue(undefined);
  mocks.requireAgentPermission.mockResolvedValue({ orgId: "org-1" });
  mocks.resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
  mocks.getIntegration.mockReturnValue({
    id: "gmail",
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://accounts.example/authorize",
      tokenUrl: "https://tokens.example/token",
      scopes: ["mail.read"],
      pkce: true,
      pkceMethod: "S256",
      extraParams: { access_type: "offline", state: "attacker-state" },
    },
  });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM platform_integrations")) return [{ enabled: true, allowed_plans: ["pro"] }];
    if (sql.includes("FROM organisation_integrations")) return [{ enabled: true }];
    if (sql.includes("FROM platform_integration_oauth_apps")) return [{
      client_id: "client-id",
      redirect_uri: "https://clara.example/api/integrations/oauth/callback",
      scopes: ["mail.read", "mail.send"],
    }];
    return [];
  });
});

describe("OAuth start", () => {
  it("creates a one-time state record and builds an authorization URL with PKCE", async () => {
    const response = await GET(request(), { params: Promise.resolve({ orgId: "org-1", integrationId: "gmail" }) });
    expect(response.status).toBe(200);
    const { authorizationUrl } = await response.json();
    const url = new URL(authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.example/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://clara.example/api/integrations/oauth/callback");
    expect(url.searchParams.get("scope")).toBe("mail.read mail.send");
    expect(url.searchParams.get("state")).not.toBe("attacker-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO integration_oauth_states"),
      [
        expect.stringMatching(/^[a-f0-9]{64}$/),
        "gmail",
        "org-1",
        "user-1",
        null,
        "https://clara.example/api/integrations/oauth/callback",
        expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        "test-encryption-key",
        expect.any(Date),
      ],
    );
  });

  it("refuses to start when the organisation integration is disabled", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM platform_integrations")) return [{ enabled: true, allowed_plans: ["pro"] }];
      if (sql.includes("FROM organisation_integrations")) return [{ enabled: false }];
      return [];
    });
    const response = await GET(request(), { params: Promise.resolve({ orgId: "org-1", integrationId: "gmail" }) });
    expect(response.status).toBe(409);
    expect(mocks.query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO integration_oauth_states"),
      expect.anything(),
    );
  });
});
