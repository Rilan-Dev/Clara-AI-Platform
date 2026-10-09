import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  ensureMigrated: vi.fn(),
  getIntegration: vi.fn(),
  resolveOrgPlanLimits: vi.fn(),
  transactionQuery: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key" }));
vi.mock("@/lib/plan-guard", () => ({ resolveOrgPlanLimits: mocks.resolveOrgPlanLimits }));
vi.mock("@/modules/integrations/registry", () => ({ getIntegration: mocks.getIntegration }));

import { GET } from "./route";

function callbackRequest(query = "state=opaque-state&code=authorization-code") {
  return new NextRequest(`https://clara.example/api/integrations/oauth/callback?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.getIntegration.mockReturnValue({
    id: "gmail",
    displayName: "Gmail",
    authType: "oauth2",
    oauth2Config: {
      authUrl: "https://accounts.example/authorize",
      tokenUrl: "https://tokens.example/token",
      scopes: ["mail.read"],
      pkce: false,
    },
  });
  mocks.resolveOrgPlanLimits.mockResolvedValue({ plan_id: "pro" });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("UPDATE integration_oauth_states")) {
      return [{
        integration_id: "gmail",
        org_id: "org-1",
        user_id: "user-1",
        agent_id: null,
        redirect_uri: "https://clara.example/api/integrations/oauth/callback",
        code_verifier: null,
      }];
    }
    if (sql.includes("pgp_sym_decrypt(client_secret_encrypted")) {
      return [{
        client_id: "client-id",
        client_secret: "client-secret",
        redirect_uri: "https://clara.example/api/integrations/oauth/callback",
      }];
    }
    if (sql.includes("FROM organisation_integrations")) return [{ enabled: true }];
    if (sql.includes("FROM platform_integrations")) return [{ enabled: true, allowed_plans: ["pro"] }];
    return [];
  });
  mocks.transactionQuery.mockResolvedValue({ rows: [] });
  mocks.withTransaction.mockImplementation(async (callback: (client: { query: typeof mocks.transactionQuery }) => Promise<unknown>) =>
    callback({ query: mocks.transactionQuery }),
  );
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "Bearer",
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("OAuth callback", () => {
  it("atomically consumes state, exchanges the code, and stores the encrypted tenant connection", async () => {
    const response = await GET(callbackRequest());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/orgs/org-1/integrations?oauth=connected&integrationId=gmail");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("consumed_at IS NULL"),
      [expect.any(String), "test-encryption-key"],
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL("https://tokens.example/token"),
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("pgp_sym_encrypt"),
      expect.arrayContaining(["org-1", null, "user-1", "gmail"]),
    );
  });

  it("rejects invalid or replayed state without exchanging a token", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("UPDATE integration_oauth_states") ? [] : []);
    const response = await GET(callbackRequest());
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the organisation grant is disabled during consent", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE integration_oauth_states")) return [{
        integration_id: "gmail",
        org_id: "org-1",
        user_id: "user-1",
        agent_id: null,
        redirect_uri: "https://clara.example/api/integrations/oauth/callback",
        code_verifier: null,
      }];
      if (sql.includes("pgp_sym_decrypt(client_secret_encrypted")) return [{
        client_id: "client-id",
        client_secret: "client-secret",
        redirect_uri: "https://clara.example/api/integrations/oauth/callback",
      }];
      if (sql.includes("FROM organisation_integrations")) return [{ enabled: false }];
      if (sql.includes("FROM platform_integrations")) return [{ enabled: true, allowed_plans: ["pro"] }];
      return [];
    });
    const response = await GET(callbackRequest());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("oauth=error");
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });
});
