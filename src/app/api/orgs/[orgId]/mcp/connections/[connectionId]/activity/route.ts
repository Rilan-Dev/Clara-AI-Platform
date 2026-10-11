import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { listOrgMcpAudit } from "@/modules/mcp";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; connectionId: string }> };

/**
 * GET /api/orgs/[orgId]/mcp/connections/[connectionId]/activity
 * Scoped audit history for one connection. Details are safe projections
 * (no credentials, no secrets).
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");
    const limitParam = new URL(req.url).searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    const entries = await listOrgMcpAudit(orgId, {
      entityId: connectionId,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp activity GET]", err);
    return NextResponse.json({ error: "Failed to load MCP activity" }, { status: 500 });
  }
}
