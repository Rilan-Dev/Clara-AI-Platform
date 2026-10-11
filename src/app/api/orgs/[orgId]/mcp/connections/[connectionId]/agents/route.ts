import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { McpServiceError, setOrgMcpAgentGrant } from "@/modules/mcp/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; connectionId: string }> };

/**
 * GET /api/orgs/[orgId]/mcp/connections/[connectionId]/agents
 * Per-agent access state for this connection's approved tools — used by the
 * connection detail "Agent access" tab. Only the organisation's own agents
 * are listed.
 */
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");

    const connection = await query<{ id: string }>(
      `SELECT id FROM org_mcp_connections WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [connectionId, orgId],
    );
    if (!connection[0]) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const [agents, tools, grants] = await Promise.all([
      query<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM agents WHERE org_id = $1 ORDER BY name ASC`,
        [orgId],
      ),
      query<{ id: string; tool_name: string }>(
        `SELECT id, tool_name FROM org_mcp_tools
          WHERE connection_id = $1 AND org_id = $2 AND approved = TRUE AND status = 'approved'
          ORDER BY tool_name ASC`,
        [connectionId, orgId],
      ),
      query<{ agent_id: string; tool_id: string }>(
        `SELECT g.agent_id, g.tool_id
           FROM org_mcp_agent_grants g
           JOIN org_mcp_tools t ON t.id = g.tool_id
          WHERE t.connection_id = $1 AND g.org_id = $2 AND g.enabled = TRUE`,
        [connectionId, orgId],
      ),
    ]);

    const grantSet = new Set(grants.map((g) => `${g.agent_id}:${g.tool_id}`));
    return NextResponse.json({
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        tools: tools.map((tool) => ({
          toolId: tool.id,
          toolName: tool.tool_name,
          granted: grantSet.has(`${agent.id}:${tool.id}`),
        })),
        grantedCount: tools.filter((tool) => grantSet.has(`${agent.id}:${tool.id}`)).length,
      })),
      toolCount: tools.length,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org mcp connection agents GET]", err);
    return NextResponse.json({ error: "Failed to load agent access" }, { status: 500 });
  }
}

/**
 * PATCH /api/orgs/[orgId]/mcp/connections/[connectionId]/agents
 * Grant/revoke one tool for one agent from the connection detail view.
 * The tool must belong to this org and connection; the agent must belong to
 * this org; limits are enforced inside the service.
 */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, connectionId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = (await req.json()) as {
      agentId?: string;
      toolId?: string;
      enabled?: boolean;
    };
    if (typeof body.agentId !== "string" || typeof body.toolId !== "string" || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "agentId, toolId and enabled are required" },
        { status: 400 },
      );
    }
    const tool = await query<{ id: string }>(
      `SELECT t.id FROM org_mcp_tools t
        WHERE t.id = $1 AND t.org_id = $2 AND t.connection_id = $3 LIMIT 1`,
      [body.toolId, orgId, connectionId],
    );
    if (!tool[0]) {
      return NextResponse.json({ error: "Tool not found on this connection" }, { status: 404 });
    }
    const agent = await query<{ id: string; org_id: string }>(
      `SELECT id, org_id FROM agents WHERE id = $1 LIMIT 1`,
      [body.agentId],
    );
    if (!agent[0] || agent[0].org_id !== orgId) {
      return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    }
    try {
      await setOrgMcpAgentGrant(orgId, auth.user.id, body.toolId, body.agentId, body.enabled);
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
    console.error("[org mcp connection agents PATCH]", err);
    return NextResponse.json({ error: "Failed to update agent access" }, { status: 500 });
  }
}
