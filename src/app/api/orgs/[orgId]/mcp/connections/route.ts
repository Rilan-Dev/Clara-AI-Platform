import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { McpServiceError } from "@/modules/mcp/service";
import {
  createOrgMcpConnection,
  probeOrgMcpEndpoint,
  listOrgMcpConnections,
} from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string }> };

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
 * GET /api/orgs/[orgId]/mcp/connections — list connections (org-scoped).
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");
    const connections = await listOrgMcpConnections(orgId);
    return NextResponse.json({ connections });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connections GET]", err);
    return NextResponse.json({ error: "Failed to list MCP connections" }, { status: 500 });
  }
}

/**
 * POST /api/orgs/[orgId]/mcp/connections
 *
 * Two modes:
 *   - action "probe": live endpoint validation (SSRF policy + MCP handshake +
 *     tool discovery) without persistence. Used by wizard step 3.
 *   - action "create" (default): full transactional creation with live
 *     re-validation, explicit tool approval and entitlement enforcement.
 *
 * Client-supplied entitlement/quota values are never trusted; everything is
 * re-resolved server-side.
 */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = (await req.json()) as {
      action?: "probe" | "create";
      name?: string;
      description?: string;
      endpointUrl?: string;
      authType?: string;
      credentials?: Record<string, string>;
      approvedToolNames?: string[];
    };

    const action = body.action ?? "create";
    const endpointUrl = typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : "";
    const authType = typeof body.authType === "string" ? body.authType : "";
    const credentials =
      body.credentials && typeof body.credentials === "object" && !Array.isArray(body.credentials)
        ? (body.credentials as Record<string, string>)
        : {};

    if (!endpointUrl || !authType) {
      return NextResponse.json(
        { error: "endpointUrl and authType are required" },
        { status: 400 },
      );
    }

    if (action === "probe") {
      try {
        const probe = await probeOrgMcpEndpoint(orgId, auth.user.id, {
          endpointUrl,
          authType,
          credentials,
        });
        return NextResponse.json(probe);
      } catch (err) {
        if (err instanceof McpServiceError) return serviceError(err);
        throw err;
      }
    }

    if (action !== "create") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name : "";
    const description = typeof body.description === "string" ? body.description : "";
    const approvedToolNames = Array.isArray(body.approvedToolNames)
      ? body.approvedToolNames.filter((n): n is string => typeof n === "string")
      : [];

    try {
      const result = await createOrgMcpConnection({
        orgId,
        actorUserId: auth.user.id,
        name,
        description,
        endpointUrl,
        authType,
        credentials,
        approvedToolNames,
      });
      return NextResponse.json(
        { connectionId: result.connectionId, connection: result.summary },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof McpServiceError) return serviceError(err);
      throw err;
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connections POST]", err);
    return NextResponse.json({ error: "Failed to create MCP connection" }, { status: 500 });
  }
}