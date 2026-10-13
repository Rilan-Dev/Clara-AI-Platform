import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { isPrivateOrLocalHostname, oauthRequestOriginMatches, resolvePublicOrigin } from "@/lib/public-origin";
import { hashOAuthState } from "@/modules/integrations/oauth-state";
import {
  buildOAuthCredentialFromTokenSet,
  exchangeMcpAuthorizationCode,
  McpOAuthError,
} from "@/modules/ai-platform-core/mcp-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type PendingState = {
  server_id: string;
  redirect_uri: string;
  code_verifier: string;
  client_id: string;
  client_secret: string | null;
  scopes: string | null;
  resource: string | null;
  authorization_endpoint: string;
  token_endpoint: string;
  expires_at: string;
};

function settingsReturnUrl(origin: string, status: string, reason?: string, serverKey?: string): URL {
  const url = new URL("/settings/mcp", origin);
  url.searchParams.set("mcp_oauth", status);
  if (reason) url.searchParams.set("reason", reason);
  if (serverKey) url.searchParams.set("server", serverKey);
  return url;
}

/**
 * GET /api/platform/mcp-servers/oauth/callback — finish the MCP OAuth sign-in.
 *
 * The authorization server redirects the admin's browser here with a one-time
 * code + state. The state row (single-use, expiring, PKCE verifier encrypted)
 * was created by the start route. This route exchanges the code with the PKCE
 * verifier, stores the resulting token set encrypted on the MCP server row
 * (never returned by any API, refreshed silently at runtime), and redirects
 * back to the MCP settings screen with a status flag the UI turns into a
 * banner. Every failure path redirects — an admin never sees raw JSON here.
 */
export async function GET(req: NextRequest) {
  // Pre-state redirects (auth failure, provider error, missing code) use the
  // request-derived public origin — req.nextUrl.origin would surface the bind
  // address (e.g. https://0.0.0.0:3000) behind Host-rewriting reverse proxies.
  // Once the state row is loaded, the state-bound redirect URI's origin takes
  // over (see below).
  const requestOrigin = resolvePublicOrigin(req);
  let authed = false;
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    authed = true;
  } catch {
    authed = false;
  }
  if (!authed) {
    return NextResponse.redirect(settingsReturnUrl(requestOrigin, "error", "auth"));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const providerError = req.nextUrl.searchParams.get("error");
  if (providerError) {
    const cancelled = providerError === "access_denied" || providerError === "user_cancelled" || providerError === "consent_denied";
    return NextResponse.redirect(settingsReturnUrl(requestOrigin, cancelled ? "cancelled" : "error", providerError.slice(0, 64)));
  }
  if (!code || !state) {
    return NextResponse.redirect(settingsReturnUrl(requestOrigin, "error", "missing_code"));
  }

  // Single-use, expiring state lookup + atomic consumption.
  const stateHash = hashOAuthState(state);
  const consumed = await query<PendingState>(
    `UPDATE platform_mcp_oauth_states SET consumed_at = now()
      WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING server_id, redirect_uri,
                pgp_sym_decrypt(code_verifier_encrypted, $2) AS code_verifier,
                client_id,
                pgp_sym_decrypt(client_secret_encrypted, $2) AS client_secret,
                scopes, resource, authorization_endpoint, token_endpoint, expires_at`,
    [stateHash, ENCRYPTION_KEY],
  );
  const pending = consumed[0];
  if (!pending) {
    return NextResponse.redirect(settingsReturnUrl(requestOrigin, "error", "state_not_found"));
  }

  // Post-state return origin: the state-bound redirect URI's origin is where
  // the provider just redirected the admin's browser. Fall back to the
  // request-derived public origin when the state row carries a private/bind
  // address (flows started before the proxy fix, or an unconfigured public
  // origin) so the admin still lands on a reachable settings page.
  let origin = requestOrigin;
  try {
    const stateOrigin = new URL(pending.redirect_uri).origin;
    if (!isPrivateOrLocalHostname(new URL(stateOrigin).hostname)) origin = stateOrigin;
  } catch {
    // Corrupt state row — keep the request-derived origin.
  }

  // The callback must land on the path the state was bound to, on the
  // deployment's public origin. The provider already redirected the browser to
  // the exact registered redirect URI, so the origin comparison is against the
  // request-derived public origin; a private/bind request host (reverse-proxy
  // hop) is tolerated, and a genuinely different public origin still fails
  // closed.
  let expected: URL | null = null;
  try {
    expected = new URL(pending.redirect_uri);
  } catch {
    expected = null;
  }
  if (
    !expected ||
    expected.pathname !== req.nextUrl.pathname ||
    !oauthRequestOriginMatches(expected.origin, req)
  ) {
    return NextResponse.redirect(settingsReturnUrl(origin, "error", "redirect_mismatch"));
  }

  let serverKey: string | undefined;
  try {
    const tokens = await exchangeMcpAuthorizationCode(
      {
        issuer: null,
        authorization_endpoint: pending.authorization_endpoint,
        token_endpoint: pending.token_endpoint,
        registration_endpoint: null,
        scopes_supported: null,
      },
      {
        code,
        codeVerifier: pending.code_verifier,
        clientId: pending.client_id,
        clientSecret: pending.client_secret,
        redirectUri: pending.redirect_uri,
        resource: pending.resource,
      },
    );
    const credential = buildOAuthCredentialFromTokenSet(tokens, {
      clientId: pending.client_id,
      clientSecret: pending.client_secret,
      tokenEndpoint: pending.token_endpoint,
      resource: pending.resource,
    });
    const saved = await query<{ server_key: string }>(
      `UPDATE platform_mcp_servers
          SET platform_credentials_encrypted = pgp_sym_encrypt($2, $3),
              oauth_status = 'connected', oauth_error = NULL,
              oauth_connected_at = now(), updated_at = now()
        WHERE id = $1::uuid AND auth_mode = 'oauth'
        RETURNING server_key`,
      [pending.server_id, JSON.stringify(credential), ENCRYPTION_KEY],
    );
    if (!saved[0]) {
      return NextResponse.redirect(settingsReturnUrl(origin, "error", "server_missing"));
    }
    serverKey = saved[0].server_key;
    return NextResponse.redirect(settingsReturnUrl(origin, "connected", undefined, serverKey));
  } catch (err) {
    const reason = err instanceof McpOAuthError ? err.code : "exchange_failed";
    const detail = err instanceof Error ? err.message.slice(0, 300) : "The code exchange failed.";
    try {
      await query(
        `UPDATE platform_mcp_servers SET oauth_status = 'error', oauth_error = $2, updated_at = now()
          WHERE id = $1::uuid AND auth_mode = 'oauth'`,
        [pending.server_id, `${reason}: ${detail}`],
      );
    } catch { /* health write must not mask the redirect */ }
    return NextResponse.redirect(settingsReturnUrl(origin, "error", reason.slice(0, 64)));
  }
}
