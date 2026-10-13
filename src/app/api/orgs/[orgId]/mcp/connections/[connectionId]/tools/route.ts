import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import {
  McpServiceError,
  rediscoverOrgMcpTools,
  setOrgMcpToolApproval,
} from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; connectionId: string }> };

/**
 * POST /api/orgs/[orgId]/mcp/connections/[connectionId]/tools
 * Re-run tool discovery (live `tools/list`) and reconcile stored rows.
 * New tools are never auto-approved; missing tools become `stale`.
 */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    try {
      const result = await rediscoverOrgMcpTools(orgId, auth.user.id, connectionId);
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
    console.error("[org mcp tools rediscover]", err);
    return NextResponse.json({ error: "Failed to rediscover MCP tools" }, { status: 500 });
  }
}

/**
 * PATCH /api/orgs/[orgId]/mcp/connections/[connectionId]/tools
 * Approve or revoke one discovered tool (explicit organisation approval).
 * Revoking cascades to agent grants.
 */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = (await req.json()) as { toolName?: string; approved?: boolean };
    if (typeof body.toolName !== "string" || typeof body.approved !== "boolean") {
      return NextResponse.json(
        { error: "toolName and approved are required" },
        { status: 400 },
      );
    }
    try {
      await setOrgMcpToolApproval(
        orgId,
        auth.user.id,
        connectionId,
        body.toolName,
        body.approved,
      );
      return NextResponse.json({ ok: true, approved: body.approved });
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
    console.error("[org mcp tool approval]", err);
    return NextResponse.json({ error: "Failed to update tool approval" }, { status: 500 });
  }
}