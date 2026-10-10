import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { createOAuthState } from "@/modules/integrations/oauth-state";
import {
  buildMcpAuthorizationUrl,
  fetchAuthorizationServerMetadata,
  McpOAuthError,
  probeMcpAuthRequirements,
  registerMcpOAuthClient,
} from "@/modules/ai-platform-core/mcp-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const MCP_OAUTH_CALLBACK_PATH = "/api/platform/mcp-servers/oauth/callback";

function parseScopes(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const scopes = list.filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9_.:/-]{1,256}$/.test(s)).slice(0, 32);
  return scopes;
}

/**
 * POST /api/platform/mcp-servers/oauth/start — begin the MCP OAuth sign-in.
 *
 * Runs the full MCP-spec dance server-side before anything touches the
 * browser: unauthenticated endpoint probe (RFC 9728 resource indicator),
 * authorization-server metadata discovery (RFC 8414), then dynamic client
 * registration (RFC 7591) — or a manually registered client when the
 * authorization server does not support DCR. Returns the authorization URL;
 * the admin's browser is sent there to sign in, and the authorization server
 * redirects back to the callback route with the one-time state stored here.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as {
      serverId?: unknown; scopes?: unknown; clientId?: unknown; clientSecret?: unknown;
    };
    if (typeof body.serverId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.serverId)) {
      return NextResponse.json({ error: "A valid serverId is required" }, { status: 400 });
    }
    const manualClientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const manualClientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    if (body.clientId !== undefined && (!manualClientId || manualClientId.length > 512 || /[\u0000-\u001f\u007f]/.test(manualClientId))) {
      return NextResponse.json({ error: "clientId must be 1-512 printable characters" }, { status: 400 });
    }
    if (body.clientSecret !== undefined && body.clientSecret !== "" && (manualClientSecret.length > 2048 || /[\u0000-\u001f\u007f]/.test(manualClientSecret))) {
      return NextResponse.json({ error: "clientSecret is too long or contains invalid characters" }, { status: 400 });
    }

    const server = (await query<{ server_key: string; auth_mode: string; endpoint_url: string }>(
      `SELECT server_key, auth_mode, endpoint_url FROM platform_mcp_servers WHERE id = $1`,
      [body.serverId],
    ))[0];
    if (!server) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    if (server.auth_mode !== "oauth") {
      return NextResponse.json({ error: "This MCP server is not configured for OAuth sign-in. Set its authentication mode to OAuth first.", code: "MCP_NOT_OAUTH_MODE" }, { status: 409 });
    }

    const redirectUri = new URL(MCP_OAUTH_CALLBACK_PATH, req.nextUrl.origin).toString();
    if (process.env.NODE_ENV === "production" && !redirectUri.startsWith("https://")) {
      return NextResponse.json({ error: "The platform must be served over HTTPS in production to complete OAuth sign-in." }, { status: 409 });
    }

    // 1. Does the endpoint actually demand authorization, and what resource
    //    does it advertise (RFC 9728 via WWW-Authenticate)?
    const probe = await probeMcpAuthRequirements(server.endpoint_url);
    if (!probe.requiresAuth) {
      return NextResponse.json({ error: "This MCP endpoint accepts unauthenticated requests — use the no-authentication mode instead.", code: "MCP_OAUTH_NOT_REQUIRED" }, { status: 409 });
    }

    // 2. Discover the authorization server (RFC 8414).
    const metadata = await fetchAuthorizationServerMetadata(server.endpoint_url);

    // 3. Obtain a client: manual credentials win when supplied (for
    //    authorization servers without dynamic registration); otherwise
    //    register dynamically per RFC 7591.
    let clientId: string;
    let clientSecret: string | null = null;
    if (manualClientId) {
      clientId = manualClientId;
      clientSecret = manualClientSecret || null;
    } else {
      const registered = await registerMcpOAuthClient(metadata, redirectUri);
      clientId = registered.clientId;
      clientSecret = registered.clientSecret;
    }

    // 4. One-time state + PKCE S256 verifier, stored server-side only.
    const created = createOAuthState();
    const scopes = parseScopes(body.scopes);
    // Opportunistically drop expired/consumed records so state does not grow
    // without bound on deployments without a scheduler.
    await query(
      `DELETE FROM platform_mcp_oauth_states
        WHERE expires_at < now() - interval '1 day'
           OR consumed_at < now() - interval '1 day'`,
    );
    await query(
      `INSERT INTO platform_mcp_oauth_states
         (state_hash, server_id, user_id, redirect_uri, code_verifier_encrypted,
          client_id, client_secret_encrypted, scopes, resource,
          authorization_endpoint, token_endpoint, expires_at)
       VALUES ($1, $2, $3, $4, pgp_sym_encrypt($5, $6),
               $7, CASE WHEN $8::text IS NULL THEN NULL ELSE pgp_sym_encrypt($8, $9) END,
               $10, $11, $12, $13, $14)`,
      [
        created.stateHash, body.serverId, auth.user.id, redirectUri,
        created.codeVerifier, ENCRYPTION_KEY,
        clientId, clientSecret, ENCRYPTION_KEY,
        scopes && scopes.length ? scopes.join(" ") : null,
        probe.resource,
        metadata.authorization_endpoint, metadata.token_endpoint,
        created.expiresAt,
      ],
    );

    // 5. Authorization URL for the admin's browser.
    const authorizationUrl = buildMcpAuthorizationUrl(metadata, {
      clientId,
      redirectUri,
      state: created.state,
      codeChallenge: created.codeChallenge,
      scopes,
      resource: probe.resource,
    });
    return NextResponse.json({ authorizationUrl: authorizationUrl.toString() });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof McpOAuthError) {
      const status = err.code === "MCP_OAUTH_NO_DYNAMIC_REGISTRATION" || err.code === "MCP_OAUTH_METADATA_INVALID" ? 409 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[platform MCP OAuth start]", err);
    return NextResponse.json({ error: "Could not start the OAuth sign-in." }, { status: 500 });
  }
}
