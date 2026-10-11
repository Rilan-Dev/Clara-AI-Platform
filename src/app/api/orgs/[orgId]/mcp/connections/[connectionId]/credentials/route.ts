import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { McpServiceError, rotateOrgMcpCredentials } from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; connectionId: string }> };

/**
 * PUT /api/orgs/[orgId]/mcp/connections/[connectionId]/credentials
 * Credential rotation: verifies the new credentials with a real handshake
 * before persisting them encrypted. Old values are never returned.
 */
export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = (await req.json()) as {
      authType?: string;
      credentials?: Record<string, string>;
    };
    if (typeof body.authType !== "string" || !body.credentials) {
      return NextResponse.json(
        { error: "authType and credentials are required" },
        { status: 400 },
      );
    }
    try {
      await rotateOrgMcpCredentials(
        orgId,
        auth.user.id,
        connectionId,
        body.authType,
        body.credentials,
      );
      return NextResponse.json({ ok: true });
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
    console.error("[org mcp credentials rotate]", err);
    return NextResponse.json({ error: "Failed to rotate MCP credentials" }, { status: 500 });
  }
}
