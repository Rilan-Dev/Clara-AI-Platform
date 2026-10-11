import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import {
  McpServiceError,
  getOrgMcpConnectionDetail,
  updateOrgMcpConnection,
  setOrgMcpConnectionStatus,
  deleteOrgMcpConnection,
} from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; connectionId: string }> };

function serviceError(err: McpServiceError): NextResponse {
  return NextResponse.json(
    {
      error: err.message,
      code: err.code,
      ...(Object.keys(err.extra).length ? err.extra : {}),
    },
    { status: err.status },
  );
}

/**
 * GET /api/orgs/[orgId]/mcp/connections/[connectionId]
 * Connection detail: tools, usage and counts — org-scoped.
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");
    const detail = await getOrgMcpConnectionDetail(orgId, connectionId);
    if (!detail) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json({ connection: detail });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connection GET]", err);
    return NextResponse.json({ error: "Failed to load MCP connection" }, { status: 500 });
  }
}

/**
 * PATCH /api/orgs/[orgId]/mcp/connections/[connectionId]
 * Update configuration, or enable/disable the connection.
 */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      endpointUrl?: string;
      enabled?: boolean;
    };

    if (typeof body.enabled === "boolean") {
      try {
        await setOrgMcpConnectionStatus(orgId, auth.user.id, connectionId, body.enabled);
        return NextResponse.json({ ok: true, enabled: body.enabled });
      } catch (err) {
        if (err instanceof McpServiceError) return serviceError(err);
        throw err;
      }
    }

    try {
      await updateOrgMcpConnection({
        orgId,
        actorUserId: auth.user.id,
        connectionId,
        name: body.name,
        description: body.description,
        endpointUrl: body.endpointUrl,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof McpServiceError) return serviceError(err);
      throw err;
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connection PATCH]", err);
    return NextResponse.json({ error: "Failed to update MCP connection" }, { status: 500 });
  }
}

/**
 * DELETE /api/orgs/[orgId]/mcp/connections/[connectionId]
 * Safe deletion: connection + tools + grants cascade; usage history survives.
 */
export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    try {
      await deleteOrgMcpConnection(orgId, auth.user.id, connectionId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof McpServiceError) return serviceError(err);
      throw err;
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connection DELETE]", err);
    return NextResponse.json({ error: "Failed to delete MCP connection" }, { status: 500 });
  }
}
