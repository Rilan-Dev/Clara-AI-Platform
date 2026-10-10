import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { probeStreamableHttpServer } from "@/modules/ai-platform-core/mcp-streamable-http-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/platform/mcp-servers/test — live MCP handshake probe.
 *
 * Two modes:
 *  - { serverId, bearerToken? }  probe a REGISTERED server's endpoint (the
 *    token is optional when the admin wants to test with a real credential;
 *    platform server rows never store credentials themselves)
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
      const server = (await query<{ endpoint_url: string }>(
        "SELECT endpoint_url FROM platform_mcp_servers WHERE id = $1", [body.serverId],
      ))[0];
      if (!server) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
      endpoint = server.endpoint_url;
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
