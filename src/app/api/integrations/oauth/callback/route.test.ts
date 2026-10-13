import { beforeEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  // Explicit Host header: undici does not auto-populate it from the URL, and
  // resolvePublicOrigin() derives the request's public origin from it.
  return new NextRequest(`https://clara.example/api/integrations/oauth/callback?${query}`, {
    headers: { host: "clara.example" },
  });
}

/**
 * Regression: behind a Host-rewriting reverse proxy (nginx's default
 * `proxy_set_header Host $proxy_host`), the app sees Host: 0.0.0.0:3000 even
 * though the user's browser is on the public domain. Before the fix the
 * callback compared the state-bound redirect URI origin against
 * request.nextUrl.origin (https://0.0.0.0:3000), failed the binding check, and
 * redirected the browser to https://0.0.0.0:3000/orgs/... — "This site can't
 * be reached / ERR_ADDRESS_INVALID" (reported on the Gmail integration at
 * clara.ai.amazetechclans.com). These tests pin the corrected behaviour.
 */
function proxiedCallbackRequest(query = "state=opaque-state&code=authorization-code") {
  // The proxy forwards x-forwarded-proto but rewrites Host to the upstream
  // bind address — exactly the reported deployment shape.
  return new NextRequest(`https://0.0.0.0:3000/api/integrations/oauth/callback?${query}`, {
    headers: { host: "0.0.0.0:3000", "x-forwarded-proto": "https" },
  });
}

const APP_URL_ENV = "NEXT_PUBLIC_APP_URL";
let appUrlEnvBackup: string | undefined;
beforeAll(() => {
  appUrlEnvBackup = process.env[APP_URL_ENV];
  delete process.env[APP_URL_ENV];
});
afterAll(() => {
  if (appUrlEnvBackup === undefined) delete process.env[APP_URL_ENV];
  else process.env[APP_URL_ENV] = appUrlEnvBackup;
});

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
    // Org-level starts land on the agents list (the org-level integrations
    // screen was retired in favour of per-agent Integrations screens).
    expect(response.headers.get("location")).toContain("/orgs/org-1/agents?oauth=connected&integrationId=gmail");
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

  it("uses Basic authentication when the provider registry requires HEADER mode", async () => {
    mocks.getIntegration.mockReturnValue({
      id: "gmail",
      displayName: "Gmail",
      authType: "oauth2",
      oauth2Config: {
        authUrl: "https://accounts.example/authorize",
        tokenUrl: "https://tokens.example/token",
        scopes: ["mail.read"],
        authorizationMethod: "HEADER",
        pkce: false,
      },
    });

    await GET(callbackRequest());
    const options = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    expect(String(options.body)).not.toContain("client_secret");
    expect(String(options.body)).not.toContain("client_id");
  });

  it("returns to the agent integrations screen when the OAuth flow was started from an agent", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE integration_oauth_states")) {
        return [{
          integration_id: "gmail",
          org_id: "org-1",
          user_id: "user-1",
          agent_id: "agent-9",
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

    const response = await GET(callbackRequest());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/orgs/org-1/agents/agent-9/integrations?oauth=connected&integrationId=gmail");
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("pgp_sym_encrypt"),
      expect.arrayContaining(["org-1", "agent-9", "user-1", "gmail"]),
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

  it("completes the connection behind a Host-rewriting reverse proxy and returns to the registered origin", async () => {
    // The provider redirected the browser to the registered redirect URI on
    // the public domain, but the reverse proxy rewrote Host to the bind
    // address, so the app sees https://0.0.0.0:3000. The connection must still
    // complete, and the browser must land on the state-bound origin — never on
    // the bind address.
    const response = await GET(proxiedCallbackRequest());
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://clara.example/orgs/org-1/agents?oauth=connected&integrationId=gmail");
    expect(location).not.toContain("0.0.0.0");
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("pgp_sym_encrypt"),
      expect.arrayContaining(["org-1", null, "user-1", "gmail"]),
    );
  });

  it("completes the connection when NEXT_PUBLIC_APP_URL identifies the public origin", async () => {
    // Production deployments seed NEXT_PUBLIC_APP_URL from
    // platform_env_settings (runtime overlay). With it set, the request's
    // public origin matches the state-bound origin exactly.
    process.env[APP_URL_ENV] = "https://clara.example";
    try {
      const response = await GET(proxiedCallbackRequest());
      expect(response.status).toBe(307);
      const location = response.headers.get("location") ?? "";
      expect(location).toContain("https://clara.example/orgs/org-1/agents?oauth=connected&integrationId=gmail");
      expect(location).not.toContain("0.0.0.0");
    } finally {
      delete process.env[APP_URL_ENV];
    }
  });

  it("fails closed on a genuinely different public origin, returning to the state-bound origin", async () => {
    // A callback that arrives on an unrelated public origin (not the bound
    // one, not a private proxy hop) must not exchange the code — and the error
    // redirect must still land on a reachable page.
    const request = new NextRequest("https://attacker.example/api/integrations/oauth/callback?state=opaque-state&code=authorization-code", {
      headers: { host: "attacker.example" },
    });
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://clara.example/orgs/org-1/agents?oauth=error&integrationId=gmail");
    expect(location).not.toContain("attacker.example");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("returns to the agent integrations screen behind a proxy when the flow was started from an agent", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE integration_oauth_states")) return [{
        integration_id: "gmail",
        org_id: "org-1",
        user_id: "user-1",
        agent_id: "agent-9",
        redirect_uri: "https://clara.example/api/integrations/oauth/callback",
        code_verifier: null,
      }];
      if (sql.includes("pgp_sym_decrypt(client_secret_encrypted")) return [{
        client_id: "client-id",
        client_secret: "client-secret",
        redirect_uri: "https://clara.example/api/integrations/oauth/callback",
      }];
      if (sql.includes("FROM organisation_integrations")) return [{ enabled: true }];
      if (sql.includes("FROM platform_integrations")) return [{ enabled: true, allowed_plans: ["pro"] }];
      return [];
    });

    const response = await GET(proxiedCallbackRequest());
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("https://clara.example/orgs/org-1/agents/agent-9/integrations?oauth=connected&integrationId=gmail");
    expect(location).not.toContain("0.0.0.0");
  });
});
