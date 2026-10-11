import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import {
  McpServiceError,
  listAgentMcpTools,
  setOrgMcpAgentGrant,
} from "@/modules/mcp/service";
import { resolveEffectiveMcpEntitlements } from "@/modules/mcp";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; agentId: string }> };

/**
 * GET /api/orgs/[orgId]/agents/[agentId]/mcp-tools
 * Organization-approved MCP tools available to this agent, with grant state
 * and per-tool unavailability reasons. Entitlement denial is reported, not
 * faked as an empty list.
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "project:read");
    if (access.orgId !== orgId) {
      return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    }

    let effective;
    try {
      effective = await resolveEffectiveMcpEntitlements(orgId);
    } catch {
      return NextResponse.json(
        { error: "MCP entitlement could not be verified. Try again shortly." },
        { status: 503 },
      );
    }

    const tools = effective.available ? await listAgentMcpTools(orgId, agentId) : [];
    return NextResponse.json({
      available: effective.available,
      denialReason: effective.denialReason,
      entitlements: effective.entitlements,
      tools,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agent mcp-tools GET]", err);
    return NextResponse.json({ error: "Failed to load agent MCP tools" }, { status: 500 });
  }
}

/**
 * PATCH /api/orgs/[orgId]/agents/[agentId]/mcp-tools
 * Grant or revoke one approved tool for this agent. Granting enforces the
 * agent-assignment limit; revocation is always available for unwinding.
 */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "project:update");
    if (access.orgId !== orgId) {
      return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    }
    const body = (await req.json()) as { toolId?: string; enabled?: boolean };
    if (typeof body.toolId !== "string" || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "toolId and enabled are required" },
        { status: 400 },
      );
    }
    try {
      await setOrgMcpAgentGrant(orgId, auth.user.id, body.toolId, agentId, body.enabled);
      return NextResponse.json({ ok: true, enabled: body.enabled });
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
    console.error("[agent mcp-tools PATCH]", err);
    return NextResponse.json({ error: "Failed to update agent MCP tool grant" }, { status: 500 });
  }
}
