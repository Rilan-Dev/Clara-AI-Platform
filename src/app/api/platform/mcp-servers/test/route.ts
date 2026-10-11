import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { probeStreamableHttpServer } from "@/modules/ai-platform-core/mcp-streamable-http-resolver";
import { parseMcpPlatformCredential, resolveMcpAccessToken } from "@/modules/ai-platform-core/mcp-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/platform/mcp-servers/test — live MCP handshake probe.
 *
 * Two modes:
 *  - { serverId, bearerToken? }  probe a REGISTERED server. Without an
 *    explicit override token the probe uses the server's stored platform
 *    credential: the admin-supplied bearer token, or the OAuth access token
 *    (silently refreshed when expired). This is what makes "test" work after
 *    registering with a real credential.
 *  - { endpointUrl, bearerToken? } probe an endpoint BEFORE registering it
 *
 * The probe shares the runtime resolver's hardened transport (DNS
 * re-resolution, private-range rejection, pinned sockets, no redirects,
 * time/response bounds) but is not gated by ENABLE_MCP: verifying an
 * endpoint is admin tooling, not agent runtime dispatch. The bearer token is
 * never logged and never echoed back.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as { serverId?: unknown; endpointUrl?: unknown; bearerToken?: unknown };
    if (typeof body.bearerToken !== "string" && body.bearerToken !== undefined) {
      return NextResponse.json({ error: "bearerToken must be a string" }, { status: 400 });
    }
    let endpoint: string;
    if (typeof body.serverId === "string" && body.serverId) {
      if (!/^[0-9a-f-]{36}$/i.test(body.serverId)) return NextResponse.json({ error: "Invalid serverId" }, { status: 400 });
      const server = (await query<{ endpoint_url: string; auth_mode: string; platform_credential: string | null }>(
        `SELECT endpoint_url, auth_mode,
                pgp_sym_decrypt(platform_credentials_encrypted, $2) AS platform_credential
           FROM platform_mcp_servers WHERE id = $1`,
        [body.serverId, ENCRYPTION_KEY],
      ))[0];
      if (!server) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
      // An endpointUrl alongside serverId overrides the registered endpoint
      // (discovery while editing an unsaved endpoint change) while still
      // resolving the stored credential when no explicit token is supplied.
      endpoint = typeof body.endpointUrl === "string" && body.endpointUrl.trim() ? body.endpointUrl.trim() : server.endpoint_url;
      // No explicit override: fall back to the stored platform credential so a
      // post-registration test reflects exactly what the runtime will send.
      if (typeof body.bearerToken !== "string" && server.auth_mode !== "none") {
        if (server.auth_mode === "oauth") {
          const accessToken = await resolveMcpAccessToken(body.serverId, server.platform_credential);
          if (!accessToken) {
            return NextResponse.json({ probe: {
              ok: false, endpoint, durationMs: 0,
              error: server.platform_credential
                ? "The stored OAuth credential could not be refreshed. Sign in again to re-authorize this MCP server."
                : "This server uses OAuth sign-in, which has not been completed yet. Use Sign in with OAuth, then test again.",
              errorCode: server.platform_credential ? "MCP_OAUTH_REFRESH_FAILED" : "MCP_OAUTH_NOT_CONNECTED",
            } }, { status: 502 });
          }
          const result = await probeStreamableHttpServer(endpoint, accessToken);
          return NextResponse.json({ probe: result }, { status: result.ok ? 200 : 502 });
        }
        const credential = parseMcpPlatformCredential(server.platform_credential);
        if (credential?.type !== "bearer") {
          return NextResponse.json({ probe: {
            ok: false, endpoint, durationMs: 0,
            error: "No platform bearer token is stored for this server. Add one in Edit (or test with a temporary token above) before testing.",
            errorCode: "MCP_NO_PLATFORM_CREDENTIAL",
          } }, { status: 400 });
        }
        const result = await probeStreamableHttpServer(endpoint, credential.bearerToken);
        return NextResponse.json({ probe: result }, { status: result.ok ? 200 : 502 });
      }
    } else if (typeof body.endpointUrl === "string" && body.endpointUrl.trim()) {
      endpoint = body.endpointUrl.trim();
    } else {
      return NextResponse.json({ error: "serverId or endpointUrl is required" }, { status: 400 });
    }
    const bearerToken = typeof body.bearerToken === "string" ? body.bearerToken : null;
    const result = await probeStreamableHttpServer(endpoint, bearerToken);
    return NextResponse.json({ probe: result }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform MCP test]", err);
    return NextResponse.json({ error: "Failed to probe MCP server" }, { status: 500 });
  }
}
