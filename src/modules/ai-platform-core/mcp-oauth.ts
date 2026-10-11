/**
 * MCP authorization: OAuth 2.1 client per the MCP specification (2025-03-26
 * and 2025-06-18 revisions) plus platform credential helpers.
 *
 * Flow implemented here:
 *  1. probe the MCP endpoint unauthenticated; a 401 with WWW-Authenticate
 *     yields the RFC 9728 resource indicator
 *  2. discover authorization-server metadata (RFC 8414): path-inserted
 *     /.well-known/oauth-authorization-server, then origin-level, then the
 *     /.well-known/openid-configuration fallback
 *  3. dynamic client registration (RFC 7591) — public client, PKCE S256;
 *     admins can instead supply a manually registered client id/secret
 *  4. authorization-code + PKCE exchange, and refresh-token rotation
 *
 * All outbound requests go through the hardened shared transport
 * (mcp-http-transport.ts): HTTPS only, DNS re-resolution with private-range
 * rejection, pinned sockets, no redirects, bounded size and time. Tokens and
 * client secrets are never logged and never returned to clients.
 */
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { mcpHttpRequest, validateMcpEndpoint } from "./mcp-http-transport";

const OAUTH_HTTP_TIMEOUT_MS = 12_000;
const MAX_TOKEN_LENGTH = 8_192;
const MAX_CLIENT_ID_LENGTH = 512;
const MAX_CLIENT_SECRET_LENGTH = 2_048;
const MAX_SCOPE_LENGTH = 2_048;
const MAX_METADATA_BYTES = 262_144;
/** Refresh this many milliseconds before the recorded expiry. */
const REFRESH_SKEW_MS = 60_000;
const MCP_PROTOCOL_VERSION = "2025-03-26";

/** Typed OAuth failures; `code` is surfaced to admins as an actionable hint. */
export class McpOAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "McpOAuthError";
    this.code = code;
  }
}

export type McpAuthorizationServerMetadata = {
  issuer: string | null;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string | null;
  scopes_supported: string[] | null;
};

export type McpOAuthClientCredentials = {
  clientId: string;
  clientSecret: string | null;
};

export type McpTokenSet = {
  access_token: string;
  token_type: string;
  expires_in: number | null;
  refresh_token: string | null;
  scope: string | null;
};

export type McpPlatformCredential =
  | { type: "bearer"; bearerToken: string }
  | {
      type: "oauth";
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
      tokenType: string;
      scope: string | null;
      clientId: string;
      clientSecret: string | null;
      tokenEndpoint: string;
      resource: string | null;
    };

// ─── RFC 9728 resource indicators ───────────────────────────────────────────

/** Extract the `resource` parameter from a WWW-Authenticate Bearer challenge. */
export function parseWwwAuthenticateResource(header: unknown): string | null {
  if (typeof header !== "string" || !header.trim()) return null;
  const challenge = header.trim();
  if (!/^bearer\s/i.test(challenge)) return null;
  // Parameters are quoted strings per RFC 7235; separators may be spaces,
  // commas or semicolons. Accept the common shapes.
  const match = challenge.match(/(?:^[\s,;]|[\s,;]\s*)resource\s*=\s*"([^"]*)"/i) ?? challenge.match(/(?:^[\s,;]|[\s,;]\s*)resource\s*=\s*([^"';,\s]+)/i);
  if (!match || !match[1]) return null;
  const resource = match[1].trim();
  if (!resource || resource.length > 2048) return null;
  try {
    const url = new URL(resource);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// ─── Authorization-server metadata discovery (RFC 8414) ─────────────────────

/** Candidate well-known URLs for an MCP endpoint, in spec order. */
export function authorizationServerMetadataCandidates(endpointUrl: string): string[] {
  const url = validateMcpEndpoint(endpointUrl);
  const origin = `${url.protocol}//${url.host}`;
  const path = url.pathname.replace(/\/+$/, "");
  const candidates: string[] = [];
  if (path && path !== "/") {
    candidates.push(`${origin}/.well-known/oauth-authorization-server${path}`);
  }
  candidates.push(`${origin}/.well-known/oauth-authorization-server`);
  candidates.push(`${origin}/.well-known/openid-configuration`);
  return [...new Set(candidates)];
}

function safeOAuthEndpointUrl(value: unknown, label: string): URL {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) {
    throw new McpOAuthError("MCP_OAUTH_METADATA_INVALID", `Authorization-server metadata has an invalid ${label}.`);
  }
  let url: URL;
  try { url = new URL(value); } catch {
    throw new McpOAuthError("MCP_OAUTH_METADATA_INVALID", `Authorization-server metadata has an invalid ${label}.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new McpOAuthError("MCP_OAUTH_METADATA_INVALID", `Authorization-server ${label} must be a clean HTTPS URL.`);
  }
  return url;
}

/** Validate the parsed shape of an authorization-server metadata document. */
export function validateAuthorizationServerMetadata(raw: unknown): McpAuthorizationServerMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new McpOAuthError("MCP_OAUTH_METADATA_INVALID", "Authorization-server metadata is not a JSON object.");
  }
  const doc = raw as Record<string, unknown>;
  safeOAuthEndpointUrl(doc.authorization_endpoint, "authorization_endpoint");
  safeOAuthEndpointUrl(doc.token_endpoint, "token_endpoint");
  if (doc.issuer !== undefined && doc.issuer !== null) safeOAuthEndpointUrl(doc.issuer, "issuer");
  if (doc.registration_endpoint !== undefined && doc.registration_endpoint !== null) {
    safeOAuthEndpointUrl(doc.registration_endpoint, "registration_endpoint");
  }
  const scopes = doc.scopes_supported;
  if (scopes !== undefined && scopes !== null &&
      (!Array.isArray(scopes) || scopes.some((s) => typeof s !== "string" || !s || s.length > 256))) {
    throw new McpOAuthError("MCP_OAUTH_METADATA_INVALID", "Authorization-server scopes_supported is malformed.");
  }
  return {
    issuer: typeof doc.issuer === "string" ? doc.issuer : null,
    authorization_endpoint: String(doc.authorization_endpoint),
    token_endpoint: String(doc.token_endpoint),
    registration_endpoint: typeof doc.registration_endpoint === "string" ? doc.registration_endpoint : null,
    scopes_supported: Array.isArray(scopes) ? (scopes as string[]) : null,
  };
}

/** Fetch and validate authorization-server metadata for an MCP endpoint. */
export async function fetchAuthorizationServerMetadata(endpointUrl: string): Promise<McpAuthorizationServerMetadata> {
  const candidates = authorizationServerMetadataCandidates(endpointUrl);
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const response = await mcpHttpRequest(new URL(candidate), {
        method: "GET",
        headers: { accept: "application/json" },
        timeoutMs: OAUTH_HTTP_TIMEOUT_MS,
      });
      if (response.status < 200 || response.status >= 300) continue;
      if (response.body.length > MAX_METADATA_BYTES) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(response.body); } catch { continue; }
      return validateAuthorizationServerMetadata(parsed);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (lastError) {
    throw new McpOAuthError("MCP_OAUTH_METADATA_NOT_FOUND", "The authorization server could not be reached while discovering its metadata.");
  }
  throw new McpOAuthError("MCP_OAUTH_METADATA_NOT_FOUND", "No OAuth authorization-server metadata was found for this MCP endpoint (/.well-known/oauth-authorization-server).");
}

// ─── Endpoint auth probe ─────────────────────────────────────────────────────

export type McpAuthProbe = { requiresAuth: boolean; resource: string | null };

/** POST an initialize request with NO credential to learn the auth posture. */
export async function probeMcpAuthRequirements(endpointUrl: string): Promise<McpAuthProbe> {
  const url = validateMcpEndpoint(endpointUrl);
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: `clara-oauth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    method: "initialize",
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "clara-ai-platform", version: "1.0.0" } },
  });
  const response = await mcpHttpRequest(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": MCP_PROTOCOL_VERSION },
    timeoutMs: OAUTH_HTTP_TIMEOUT_MS,
  });
  if (response.status >= 200 && response.status < 300) {
    return { requiresAuth: false, resource: null };
  }
  const header = Array.isArray(response.headers["www-authenticate"])
    ? response.headers["www-authenticate"][0]
    : response.headers["www-authenticate"];
  return { requiresAuth: true, resource: parseWwwAuthenticateResource(header) };
}

// ─── Dynamic client registration (RFC 7591) ─────────────────────────────────

/** Register an OAuth client dynamically; public client + PKCE, no secret. */
export async function registerMcpOAuthClient(
  metadata: McpAuthorizationServerMetadata,
  redirectUri: string,
  clientName = "Clara AI Platform",
): Promise<McpOAuthClientCredentials> {
  if (!metadata.registration_endpoint) {
    throw new McpOAuthError(
      "MCP_OAUTH_NO_DYNAMIC_REGISTRATION",
      "This authorization server does not advertise dynamic client registration. Register a client manually and paste its credentials.",
    );
  }
  const endpoint = safeOAuthEndpointUrl(metadata.registration_endpoint, "registration_endpoint");
  const response = await mcpHttpRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    headers: { "content-type": "application/json", accept: "application/json" },
    timeoutMs: OAUTH_HTTP_TIMEOUT_MS,
  });
  if (response.status < 200 || response.status >= 300 || !response.body) {
    throw new McpOAuthError("MCP_OAUTH_REGISTRATION_FAILED", `Dynamic client registration was rejected (HTTP ${response.status}).`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(response.body); } catch {
    throw new McpOAuthError("MCP_OAUTH_REGISTRATION_FAILED", "Dynamic client registration returned a malformed response.");
  }
  const doc = parsed as Record<string, unknown>;
  if (typeof doc.client_id !== "string" || !doc.client_id.trim() || doc.client_id.length > MAX_CLIENT_ID_LENGTH) {
    throw new McpOAuthError("MCP_OAUTH_REGISTRATION_FAILED", "Dynamic client registration did not return a client_id.");
  }
  const secret = typeof doc.client_secret === "string" && doc.client_secret.trim() ? doc.client_secret.trim() : null;
  if (secret && secret.length > MAX_CLIENT_SECRET_LENGTH) {
    throw new McpOAuthError("MCP_OAUTH_REGISTRATION_FAILED", "Dynamic client registration returned an oversized client_secret.");
  }
  return { clientId: doc.client_id.trim(), clientSecret: secret };
}

// ─── Authorization URL (authorization code + PKCE S256) ──────────────────────

export type McpAuthorizationUrlParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[] | null;
  resource?: string | null;
};

export function buildMcpAuthorizationUrl(
  metadata: McpAuthorizationServerMetadata,
  params: McpAuthorizationUrlParams,
): URL {
  const url = safeOAuthEndpointUrl(metadata.authorization_endpoint, "authorization_endpoint");
  const scope = (params.scopes && params.scopes.length ? params.scopes : metadata.scopes_supported ?? [])
    .filter((s) => typeof s === "string" && s && s.length <= 256)
    .slice(0, 32)
    .join(" ");
  // Resource indicators are normalized through URL parsing so the token
  // endpoint and the authorization request always see the same value.
  let resource: string | null = null;
  if (params.resource) {
    try {
      const parsed = new URL(params.resource);
      resource = parsed.protocol === "https:" ? parsed.toString() : null;
    } catch { resource = null; }
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (scope && scope.length <= MAX_SCOPE_LENGTH) url.searchParams.set("scope", scope);
  if (resource) url.searchParams.set("resource", resource);
  return url;
}

// ─── Token endpoint calls (form-urlencoded POST) ─────────────────────────────

function parseTokenResponse(body: string, label: string): McpTokenSet {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch {
    throw new McpOAuthError(label, "The authorization server returned a malformed token response.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new McpOAuthError(label, "The authorization server returned a malformed token response.");
  }
  const doc = parsed as Record<string, unknown>;
  if (typeof doc.access_token !== "string" || !doc.access_token || doc.access_token.length > MAX_TOKEN_LENGTH) {
    throw new McpOAuthError(label, "The token response did not contain a usable access token.");
  }
  let expiresIn: number | null = null;
  if (doc.expires_in !== undefined && doc.expires_in !== null) {
    if (typeof doc.expires_in !== "number" || !Number.isFinite(doc.expires_in) || doc.expires_in <= 0 || doc.expires_in > 2_592_000) {
      throw new McpOAuthError(label, "The token response contained an invalid expires_in.");
    }
    expiresIn = doc.expires_in;
  }
  const refreshToken = typeof doc.refresh_token === "string" && doc.refresh_token && doc.refresh_token.length <= MAX_TOKEN_LENGTH
    ? doc.refresh_token
    : null;
  const scope = typeof doc.scope === "string" && doc.scope && doc.scope.length <= MAX_SCOPE_LENGTH ? doc.scope : null;
  const tokenType = typeof doc.token_type === "string" && doc.token_type ? doc.token_type.slice(0, 64) : "Bearer";
  return { access_token: doc.access_token, token_type: tokenType, expires_in: expiresIn, refresh_token: refreshToken, scope };
}

async function tokenEndpointPost(url: URL, form: Record<string, string>, errorCode: string): Promise<McpTokenSet> {
  const response = await mcpHttpRequest(url, {
    method: "POST",
    body: new URLSearchParams(form).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    timeoutMs: OAUTH_HTTP_TIMEOUT_MS,
  });
  if (response.status < 200 || response.status >= 300 || !response.body) {
    throw new McpOAuthError(errorCode, `The authorization server rejected the request (HTTP ${response.status}).`);
  }
  return parseTokenResponse(response.body, errorCode);
}

export type McpCodeExchangeParams = {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  resource?: string | null;
};

export async function exchangeMcpAuthorizationCode(
  metadata: McpAuthorizationServerMetadata,
  params: McpCodeExchangeParams,
): Promise<McpTokenSet> {
  const url = safeOAuthEndpointUrl(metadata.token_endpoint, "token_endpoint");
  const form: Record<string, string> = {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  };
  if (params.clientSecret) form.client_secret = params.clientSecret;
  if (params.resource) form.resource = params.resource;
  return tokenEndpointPost(url, form, "MCP_OAUTH_EXCHANGE_FAILED");
}

export type McpRefreshParams = {
  refreshToken: string;
  clientId: string;
  clientSecret?: string | null;
  resource?: string | null;
};

export async function refreshMcpTokenSet(tokenEndpoint: string, params: McpRefreshParams): Promise<McpTokenSet> {
  const url = safeOAuthEndpointUrl(tokenEndpoint, "token_endpoint");
  const form: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  };
  if (params.clientSecret) form.client_secret = params.clientSecret;
  if (params.resource) form.resource = params.resource;
  return tokenEndpointPost(url, form, "MCP_OAUTH_REFRESH_FAILED");
}

// ─── Platform credential shape ───────────────────────────────────────────────

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? value : null;
}

/** Parse (and strictly validate) a decrypted platform credential JSON blob. */
export function parseMcpPlatformCredential(json: string | null): McpPlatformCredential | null {
  if (!json) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const doc = parsed as Record<string, unknown>;
  if (doc.type === "bearer") {
    if (typeof doc.bearerToken !== "string" || !doc.bearerToken || doc.bearerToken.length > MAX_TOKEN_LENGTH) return null;
    return { type: "bearer", bearerToken: doc.bearerToken };
  }
  if (doc.type === "oauth") {
    if (typeof doc.accessToken !== "string" || !doc.accessToken || doc.accessToken.length > MAX_TOKEN_LENGTH) return null;
    let tokenEndpoint: URL;
    try { tokenEndpoint = new URL(String(doc.tokenEndpoint)); } catch { return null; }
    if (tokenEndpoint.protocol !== "https:" || tokenEndpoint.username || tokenEndpoint.password) return null;
    const refreshToken = typeof doc.refreshToken === "string" && doc.refreshToken && doc.refreshToken.length <= MAX_TOKEN_LENGTH ? doc.refreshToken : null;
    const clientId = typeof doc.clientId === "string" && doc.clientId && doc.clientId.length <= MAX_CLIENT_ID_LENGTH ? doc.clientId : null;
    if (!clientId) return null;
    const clientSecret = typeof doc.clientSecret === "string" && doc.clientSecret && doc.clientSecret.length <= MAX_CLIENT_SECRET_LENGTH ? doc.clientSecret : null;
    let resource: string | null = null;
    if (typeof doc.resource === "string" && doc.resource) {
      try {
        const parsedResource = new URL(doc.resource);
        resource = parsedResource.protocol === "https:" ? parsedResource.toString() : null;
      } catch { resource = null; }
    }
    return {
      type: "oauth",
      accessToken: doc.accessToken,
      refreshToken,
      expiresAt: validIso(doc.expiresAt),
      tokenType: typeof doc.tokenType === "string" && doc.tokenType ? doc.tokenType.slice(0, 64) : "Bearer",
      scope: typeof doc.scope === "string" && doc.scope && doc.scope.length <= MAX_SCOPE_LENGTH ? doc.scope : null,
      clientId,
      clientSecret,
      tokenEndpoint: tokenEndpoint.toString(),
      resource,
    };
  }
  return null;
}

export function buildBearerCredential(bearerToken: string): McpPlatformCredential {
  return { type: "bearer", bearerToken };
}

export type McpOAuthCredential = Extract<McpPlatformCredential, { type: "oauth" }>;

export function buildOAuthCredentialFromTokenSet(
  tokens: McpTokenSet,
  context: { clientId: string; clientSecret: string | null; tokenEndpoint: string; resource: string | null; previousRefreshToken?: string | null },
): McpOAuthCredential {
  return {
    type: "oauth",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? context.previousRefreshToken ?? null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    tokenType: tokens.token_type,
    scope: tokens.scope,
    clientId: context.clientId,
    clientSecret: context.clientSecret,
    tokenEndpoint: context.tokenEndpoint,
    resource: context.resource,
  };
}

/** True when the access token is missing, expired, or about to expire. */
export function credentialNeedsRefresh(credential: McpOAuthCredential, skewMs = REFRESH_SKEW_MS, now = Date.now()): boolean {
  if (!credential.expiresAt) return false;
  const expiry = Date.parse(credential.expiresAt);
  if (!Number.isFinite(expiry)) return true;
  return expiry - now <= skewMs;
}

// ─── Runtime access-token resolution (with silent refresh + write-back) ──────

/**
 * Resolve the access token for a platform-managed credential. Bearer
 * credentials return their token directly. OAuth credentials return the
 * stored access token; when it is expired (or about to be) the refresh grant
 * runs and the rotated token set is written back encrypted. Returns null when
 * no credential exists, the credential is unusable, or refresh failed — the
 * caller then treats the server as unauthorized.
 */
export async function resolveMcpAccessToken(serverId: string, credentialJson: string | null): Promise<string | null> {
  const credential = parseMcpPlatformCredential(credentialJson);
  if (!credential) return null;
  if (credential.type === "bearer") return credential.bearerToken;
  if (!credentialNeedsRefresh(credential)) return credential.accessToken;
  if (!credential.refreshToken || !credential.tokenEndpoint) {
    // No refresh path: keep serving until the recorded expiry has passed.
    if (credential.expiresAt && Date.parse(credential.expiresAt) <= Date.now()) return null;
    return credential.accessToken;
  }
  try {
    const tokens = await refreshMcpTokenSet(credential.tokenEndpoint, {
      refreshToken: credential.refreshToken,
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
      resource: credential.resource,
    });
    const updated = buildOAuthCredentialFromTokenSet(tokens, {
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
      tokenEndpoint: credential.tokenEndpoint,
      resource: credential.resource,
      previousRefreshToken: credential.refreshToken,
    });
    await query(
      `UPDATE platform_mcp_servers
          SET platform_credentials_encrypted = pgp_sym_encrypt($2, $3),
              oauth_status = 'connected', oauth_error = NULL, updated_at = now()
        WHERE id = $1::uuid`,
      [serverId, JSON.stringify(updated), ENCRYPTION_KEY],
    );
    return updated.accessToken;
  } catch (error) {
    const code = error instanceof McpOAuthError ? error.code : "MCP_OAUTH_REFRESH_FAILED";
    const message = error instanceof Error ? error.message.slice(0, 300) : "Token refresh failed.";
    try {
      await query(
        `UPDATE platform_mcp_servers SET oauth_status = 'error', oauth_error = $2, updated_at = now() WHERE id = $1::uuid`,
        [serverId, `${code}: ${message}`],
      );
    } catch { /* health write must not mask the refresh failure */ }
    return null;
  }
}
