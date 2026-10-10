import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/platform/mcp-servers/oauth/disconnect — forget the OAuth tokens.
 *
 * Removes the encrypted credential and resets the connection state. Pending
 * state rows are also dropped so a half-finished sign-in cannot be completed
 * afterwards. Organisation connections keep their rows but the runtime will
 * treat the server as unauthorized until the admin signs in again.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as { serverId?: unknown };
    if (typeof body.serverId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.serverId)) {
      return NextResponse.json({ error: "A valid serverId is required" }, { status: 400 });
    }
    const server = (await query<{ auth_mode: string }>(
      `SELECT auth_mode FROM platform_mcp_servers WHERE id = $1`,
      [body.serverId],
    ))[0];
    if (!server) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    if (server.auth_mode !== "oauth") {
      return NextResponse.json({ error: "This MCP server does not use OAuth sign-in", code: "MCP_NOT_OAUTH_MODE" }, { status: 409 });
    }
    const result = await query(
      `UPDATE platform_mcp_servers
          SET platform_credentials_encrypted = NULL,
              oauth_status = 'not_connected', oauth_error = NULL,
              oauth_connected_at = NULL, updated_at = now()
        WHERE id = $1::uuid RETURNING id`,
      [body.serverId],
    );
    if (!result[0]) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    await query(`DELETE FROM platform_mcp_oauth_states WHERE server_id = $1::uuid`, [body.serverId]);
    return NextResponse.json({ ok: true, oauthStatus: "not_connected" });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform MCP OAuth disconnect]", err);
    return NextResponse.json({ error: "Could not disconnect the OAuth sign-in." }, { status: 500 });
  }
}
