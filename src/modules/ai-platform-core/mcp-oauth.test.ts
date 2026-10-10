import { beforeEach, describe, expect, it, vi } from "vitest";

// The transport's hardened HTTP layer is mocked at the module boundary so the
// OAuth client can be tested without real sockets; the pure URL guards stay
// real. The database is mocked for the refresh write-back path.
vi.mock("@/modules/ai-platform-core/mcp-http-transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/ai-platform-core/mcp-http-transport")>();
  return { ...actual, mcpHttpRequest: vi.fn() };
});
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "vitest-encryption-key-000000000000" }));

import { mcpHttpRequest } from "@/modules/ai-platform-core/mcp-http-transport";
import { query } from "@/lib/db";
import {
  authorizationServerMetadataCandidates,
  buildMcpAuthorizationUrl,
  buildOAuthCredentialFromTokenSet,
  credentialNeedsRefresh,
  exchangeMcpAuthorizationCode,
  fetchAuthorizationServerMetadata,
  McpOAuthError,
  parseMcpPlatformCredential,
  parseWwwAuthenticateResource,
  registerMcpOAuthClient,
  resolveMcpAccessToken,
  validateAuthorizationServerMetadata,
} from "@/modules/ai-platform-core/mcp-oauth";

const httpMock = vi.mocked(mcpHttpRequest);
const queryMock = vi.mocked(query);

const METADATA = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  registration_endpoint: "https://auth.example.com/register",
  scopes_supported: ["mcp:read", "mcp:write"],
};

describe("WWW-Authenticate resource parsing (RFC 9728)", () => {
  it("extracts a quoted resource parameter", () => {
    expect(parseWwwAuthenticateResource('Bearer realm="mcp", resource="https://mcp.example.com"')).toBe("https://mcp.example.com/");
  });
  it("extracts an unquoted resource parameter", () => {
    expect(parseWwwAuthenticateResource("Bearer resource=https://mcp.example.com")).toBe("https://mcp.example.com/");
  });
  it("returns null without a resource parameter", () => {
    expect(parseWwwAuthenticateResource('Bearer realm="mcp", error="invalid_token"')).toBeNull();
    expect(parseWwwAuthenticateResource(undefined)).toBeNull();
    expect(parseWwwAuthenticateResource("Basic realm=x")).toBeNull();
  });
  it("rejects non-HTTPS and oversized resources", () => {
    expect(parseWwwAuthenticateResource('Bearer resource="http://insecure.example.com"')).toBeNull();
    expect(parseWwwAuthenticateResource(`Bearer resource="https://${"a".repeat(2100)}.example.com"`)).toBeNull();
  });
});

describe("authorization-server metadata candidates (RFC 8414)", () => {
  it("inserts the well-known segment into the endpoint path first, then falls back", () => {
    expect(authorizationServerMetadataCandidates("https://mcp.example.com/mcp-server/http")).toEqual([
      "https://mcp.example.com/.well-known/oauth-authorization-server/mcp-server/http",
      "https://mcp.example.com/.well-known/oauth-authorization-server",
      "https://mcp.example.com/.well-known/openid-configuration",
    ]);
  });
  it("deduplicates when the endpoint has no path", () => {
    expect(authorizationServerMetadataCandidates("https://mcp.example.com")).toEqual([
      "https://mcp.example.com/.well-known/oauth-authorization-server",
      "https://mcp.example.com/.well-known/openid-configuration",
    ]);
  });
  it("rejects non-HTTPS endpoints", () => {
    expect(() => authorizationServerMetadataCandidates("http://mcp.example.com/mcp")).toThrow();
  });
});

describe("authorization-server metadata validation", () => {
  it("accepts a compliant document and defaults optional fields", () => {
    const parsed = validateAuthorizationServerMetadata({
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/token",
    });
    expect(parsed.issuer).toBeNull();
    expect(parsed.registration_endpoint).toBeNull();
    expect(parsed.scopes_supported).toBeNull();
  });
  it("rejects documents with missing or non-HTTPS endpoints", () => {
    expect(() => validateAuthorizationServerMetadata({ token_endpoint: "https://auth.example.com/token" })).toThrow(McpOAuthError);
    expect(() => validateAuthorizationServerMetadata({
      authorization_endpoint: "http://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/token",
    })).toThrow(McpOAuthError);
    expect(() => validateAuthorizationServerMetadata("not-an-object")).toThrow(McpOAuthError);
    expect(() => validateAuthorizationServerMetadata({ ...METADATA, scopes_supported: ["ok", 42] })).toThrow(McpOAuthError);
  });
});

describe("fetchAuthorizationServerMetadata", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("tries candidates in order until one serves a valid document", async () => {
    httpMock.mockImplementation(async (url: URL) => url.pathname.includes("mcp-server")
      ? { status: 404, headers: {}, body: "" }
      : { status: 200, headers: {}, body: JSON.stringify(METADATA) });
    const metadata = await fetchAuthorizationServerMetadata("https://mcp.example.com/mcp-server/http");
    expect(metadata.authorization_endpoint).toBe(METADATA.authorization_endpoint);
    expect(httpMock).toHaveBeenCalledTimes(2);
  });
  it("skips invalid JSON bodies and keeps looking", async () => {
    httpMock.mockImplementation(async (url: URL) => url.pathname.endsWith("openid-configuration")
      ? { status: 200, headers: {}, body: JSON.stringify(METADATA) }
      : { status: 200, headers: {}, body: "<html>not json</html>" });
    const metadata = await fetchAuthorizationServerMetadata("https://mcp.example.com/mcp");
    expect(metadata.token_endpoint).toBe(METADATA.token_endpoint);
    expect(httpMock).toHaveBeenCalledTimes(3);
  });
  it("throws MCP_OAUTH_METADATA_NOT_FOUND when no candidate resolves", async () => {
    httpMock.mockResolvedValue({ status: 404, headers: {}, body: "" });
    await expect(fetchAuthorizationServerMetadata("https://mcp.example.com/mcp")).rejects.toMatchObject({ code: "MCP_OAUTH_METADATA_NOT_FOUND" });
  });
});

describe("dynamic client registration (RFC 7591)", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("sends a public-client registration payload and parses the response", async () => {
    httpMock.mockResolvedValue({ status: 201, headers: {}, body: JSON.stringify({ client_id: "clara-client-1", client_secret: "optional-secret" }) });
    const client = await registerMcpOAuthClient(validateAuthorizationServerMetadata(METADATA), "https://clara.example.com/api/platform/mcp-servers/oauth/callback");
    expect(client).toEqual({ clientId: "clara-client-1", clientSecret: "optional-secret" });
    const [url, init] = httpMock.mock.calls[0]! as [URL, { body: string; headers: Record<string, string> }];
    expect(url.toString()).toBe("https://auth.example.com/register");
    const payload = JSON.parse(init.body);
    expect(payload.client_name).toBe("Clara AI Platform");
    expect(payload.redirect_uris).toEqual(["https://clara.example.com/api/platform/mcp-servers/oauth/callback"]);
    expect(payload.token_endpoint_auth_method).toBe("none");
    expect(payload.grant_types).toContain("authorization_code");
    expect(payload.grant_types).toContain("refresh_token");
    expect(init.headers["content-type"]).toBe("application/json");
  });
  it("fails with MCP_OAUTH_NO_DYNAMIC_REGISTRATION when the server advertises no registration endpoint", async () => {
    await expect(registerMcpOAuthClient({
      issuer: null, authorization_endpoint: METADATA.authorization_endpoint,
      token_endpoint: METADATA.token_endpoint, registration_endpoint: null, scopes_supported: null,
    }, "https://clara.example.com/api/platform/mcp-servers/oauth/callback")).rejects.toMatchObject({ code: "MCP_OAUTH_NO_DYNAMIC_REGISTRATION" });
    expect(httpMock).not.toHaveBeenCalled();
  });
  it("rejects registrations without a client_id", async () => {
    httpMock.mockResolvedValue({ status: 201, headers: {}, body: JSON.stringify({ redirect_uris: [] }) });
    await expect(registerMcpOAuthClient(validateAuthorizationServerMetadata(METADATA), "https://clara.example.com/cb")).rejects.toMatchObject({ code: "MCP_OAUTH_REGISTRATION_FAILED" });
  });
});

describe("authorization URL construction (authorization code + PKCE S256)", () => {
  it("sets every required parameter plus scope and resource", () => {
    const url = buildMcpAuthorizationUrl(validateAuthorizationServerMetadata(METADATA), {
      clientId: "clara-client-1",
      redirectUri: "https://clara.example.com/api/platform/mcp-servers/oauth/callback",
      state: "state-value",
      codeChallenge: "challenge-value",
      scopes: ["mcp:read", "mcp:write"],
      resource: "https://mcp.example.com",
    });
    expect(url.origin + url.pathname).toBe("https://auth.example.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("clara-client-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://clara.example.com/api/platform/mcp-servers/oauth/callback");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("mcp:read mcp:write");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/");
  });
  it("falls back to the metadata scopes when none are requested", () => {
    const url = buildMcpAuthorizationUrl(validateAuthorizationServerMetadata(METADATA), {
      clientId: "c", redirectUri: "https://clara.example.com/cb", state: "s", codeChallenge: "x",
    });
    expect(url.searchParams.get("scope")).toBe("mcp:read mcp:write");
    expect(url.searchParams.has("resource")).toBe(false);
  });
});

describe("authorization-code exchange", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("posts a form-urlencoded body with the PKCE verifier and resource", async () => {
    httpMock.mockResolvedValue({ status: 200, headers: {}, body: JSON.stringify({
      access_token: "at-1", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-1", scope: "mcp:read",
    }) });
    const tokens = await exchangeMcpAuthorizationCode(validateAuthorizationServerMetadata(METADATA), {
      code: "auth-code", codeVerifier: "verifier", clientId: "clara-client-1", clientSecret: "sec",
      redirectUri: "https://clara.example.com/cb", resource: "https://mcp.example.com",
    });
    expect(tokens).toEqual({ access_token: "at-1", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-1", scope: "mcp:read" });
    const [url, init] = httpMock.mock.calls[0]! as [URL, { body: string; headers: Record<string, string> }];
    expect(url.toString()).toBe("https://auth.example.com/token");
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("code_verifier")).toBe("verifier");
    expect(form.get("client_id")).toBe("clara-client-1");
    expect(form.get("client_secret")).toBe("sec");
    expect(form.get("resource")).toBe("https://mcp.example.com");
  });
  it("surfaces exchange failures and malformed responses", async () => {
    httpMock.mockResolvedValue({ status: 400, headers: {}, body: "invalid_grant" });
    await expect(exchangeMcpAuthorizationCode(validateAuthorizationServerMetadata(METADATA), {
      code: "c", codeVerifier: "v", clientId: "cl", redirectUri: "https://clara.example.com/cb",
    })).rejects.toMatchObject({ code: "MCP_OAUTH_EXCHANGE_FAILED" });
    httpMock.mockResolvedValue({ status: 200, headers: {}, body: "not-json" });
    await expect(exchangeMcpAuthorizationCode(validateAuthorizationServerMetadata(METADATA), {
      code: "c", codeVerifier: "v", clientId: "cl", redirectUri: "https://clara.example.com/cb",
    })).rejects.toMatchObject({ code: "MCP_OAUTH_EXCHANGE_FAILED" });
    httpMock.mockResolvedValue({ status: 200, headers: {}, body: JSON.stringify({ token_type: "Bearer" }) });
    await expect(exchangeMcpAuthorizationCode(validateAuthorizationServerMetadata(METADATA), {
      code: "c", codeVerifier: "v", clientId: "cl", redirectUri: "https://clara.example.com/cb",
    })).rejects.toMatchObject({ code: "MCP_OAUTH_EXCHANGE_FAILED" });
  });
});

describe("platform credential parsing and refresh heuristics", () => {
  it("parses bearer credentials strictly", () => {
    expect(parseMcpPlatformCredential(JSON.stringify({ type: "bearer", bearerToken: "key-12345678" }))).toEqual({ type: "bearer", bearerToken: "key-12345678" });
    expect(parseMcpPlatformCredential(JSON.stringify({ type: "bearer", bearerToken: "" }))).toBeNull();
    expect(parseMcpPlatformCredential("not json")).toBeNull();
    expect(parseMcpPlatformCredential(null)).toBeNull();
    expect(parseMcpPlatformCredential(JSON.stringify({ type: "digest" }))).toBeNull();
  });
  it("parses oauth credentials (resource normalized) and rejects unsafe token endpoints", () => {
    const oauth = { type: "oauth", accessToken: "at", refreshToken: "rt", expiresAt: "2099-01-01T00:00:00.000Z",
      tokenType: "Bearer", scope: "mcp", clientId: "clara", clientSecret: "sec",
      tokenEndpoint: "https://auth.example.com/token", resource: "https://mcp.example.com/" };
    expect(parseMcpPlatformCredential(JSON.stringify({ ...oauth, resource: "https://mcp.example.com" }))).toEqual(oauth);
    expect(parseMcpPlatformCredential(JSON.stringify({ ...oauth, tokenEndpoint: "http://auth.example.com/token" }))).toBeNull();
    expect(parseMcpPlatformCredential(JSON.stringify({ ...oauth, clientId: "" }))).toBeNull();
    expect(parseMcpPlatformCredential(JSON.stringify({ ...oauth, expiresAt: "not-a-date" }))).toMatchObject({ expiresAt: null });
  });
  it("builds oauth credentials with computed expiry and refresh-token fallback", () => {
    const before = Date.now();
    const credential = buildOAuthCredentialFromTokenSet(
      { access_token: "new-at", token_type: "Bearer", expires_in: 600, refresh_token: null, scope: "mcp" },
      { clientId: "clara", clientSecret: null, tokenEndpoint: "https://auth.example.com/token", resource: null, previousRefreshToken: "old-rt" },
    );
    expect(credential.accessToken).toBe("new-at");
    expect(credential.refreshToken).toBe("old-rt");
    expect(Date.parse(credential.expiresAt!)).toBeGreaterThanOrEqual(before + 600_000);
  });
  it("flags credentials inside the refresh skew window only", () => {
    const base = { type: "oauth" as const, accessToken: "at", refreshToken: null, expiresAt: null, tokenType: "Bearer", scope: null, clientId: "c", clientSecret: null, tokenEndpoint: "https://auth.example.com/token", resource: null };
    expect(credentialNeedsRefresh({ ...base, expiresAt: new Date(Date.now() + 30_000).toISOString() })).toBe(true);
    expect(credentialNeedsRefresh({ ...base, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })).toBe(false);
    expect(credentialNeedsRefresh({ ...base, expiresAt: null })).toBe(false);
  });
});

describe("resolveMcpAccessToken (runtime resolution with refresh)", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("returns bearer tokens directly without touching the database or network", async () => {
    const token = await resolveMcpAccessToken("server-1", JSON.stringify({ type: "bearer", bearerToken: "key-12345678" }));
    expect(token).toBe("key-12345678");
    expect(queryMock).not.toHaveBeenCalled();
    expect(httpMock).not.toHaveBeenCalled();
  });
  it("returns a valid oauth access token without refreshing", async () => {
    const token = await resolveMcpAccessToken("server-1", JSON.stringify({
      type: "oauth", accessToken: "live-at", refreshToken: "rt", expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      tokenType: "Bearer", scope: null, clientId: "clara", clientSecret: "sec",
      tokenEndpoint: "https://auth.example.com/token", resource: "https://mcp.example.com",
    }));
    expect(token).toBe("live-at");
    expect(httpMock).not.toHaveBeenCalled();
  });
  it("refreshes an expiring token, writes it back encrypted, and returns the new access token", async () => {
    httpMock.mockResolvedValue({ status: 200, headers: {}, body: JSON.stringify({
      access_token: "rotated-at", token_type: "Bearer", expires_in: 900, refresh_token: "rotated-rt", scope: "mcp",
    }) });
    const token = await resolveMcpAccessToken("server-1", JSON.stringify({
      type: "oauth", accessToken: "stale-at", refreshToken: "rt", expiresAt: new Date(Date.now() + 10_000).toISOString(),
      tokenType: "Bearer", scope: null, clientId: "clara", clientSecret: "sec",
      tokenEndpoint: "https://auth.example.com/token", resource: "https://mcp.example.com",
    }));
    expect(token).toBe("rotated-at");
    const form = new URLSearchParams((httpMock.mock.calls[0]![1] as { body: string }).body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("rt");
    expect(form.get("client_id")).toBe("clara");
    expect(form.get("client_secret")).toBe("sec");
    const update = queryMock.mock.calls[0]! as [string, unknown[]];
    expect(update[0]).toContain("pgp_sym_encrypt");
    expect(JSON.parse(update[1][1] as string)).toMatchObject({ type: "oauth", accessToken: "rotated-at", refreshToken: "rotated-rt" });
    expect(update[1][2]).toBe("vitest-encryption-key-000000000000");
  });
  it("records the failure and returns null when the refresh grant is rejected", async () => {
    httpMock.mockResolvedValue({ status: 400, headers: {}, body: "invalid_grant" });
    const token = await resolveMcpAccessToken("server-1", JSON.stringify({
      type: "oauth", accessToken: "stale-at", refreshToken: "rt", expiresAt: new Date(Date.now() - 1_000).toISOString(),
      tokenType: "Bearer", scope: null, clientId: "clara", clientSecret: null,
      tokenEndpoint: "https://auth.example.com/token", resource: null,
    }));
    expect(token).toBeNull();
    expect((queryMock.mock.calls[0]![0] as string)).toContain("oauth_status = 'error'");
  });
  it("returns null for missing or malformed credentials", async () => {
    expect(await resolveMcpAccessToken("server-1", null)).toBeNull();
    expect(await resolveMcpAccessToken("server-1", "not-json")).toBeNull();
  });
  it("keeps serving a token without a refresh path until its recorded expiry passes", async () => {
    const soon = JSON.stringify({ type: "oauth", accessToken: "at", refreshToken: null, expiresAt: new Date(Date.now() + 5_000).toISOString(), tokenType: "Bearer", scope: null, clientId: "c", clientSecret: null, tokenEndpoint: "https://auth.example.com/token", resource: null });
    expect(await resolveMcpAccessToken("server-1", soon)).toBe("at");
    const past = JSON.stringify({ type: "oauth", accessToken: "at", refreshToken: null, expiresAt: new Date(Date.now() - 5_000).toISOString(), tokenType: "Bearer", scope: null, clientId: "c", clientSecret: null, tokenEndpoint: "https://auth.example.com/token", resource: null });
    expect(await resolveMcpAccessToken("server-1", past)).toBeNull();
  });
});
