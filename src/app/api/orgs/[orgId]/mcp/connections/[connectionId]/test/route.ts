import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { McpServiceError, testOrgMcpConnection } from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; connectionId: string }> };

/**
 * POST /api/orgs/[orgId]/mcp/connections/[connectionId]/test
 * Runs a real handshake (+ discovery probe) against the stored endpoint and
 * credentials, then persists health (last_checked_at / status / last_error).
 */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    try {
      const result = await testOrgMcpConnection(orgId, auth.user.id, connectionId);
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof McpServiceError) {
        return NextResponse.json(
          { error: err.message, code: err.code, ...err.extra },
          { status: err.status },
        );
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connection test]", err);
    return NextResponse.json({ error: "Failed to test MCP connection" }, { status: 500 });
  }
}