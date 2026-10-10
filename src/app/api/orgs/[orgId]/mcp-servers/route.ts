import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, withTransaction } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAgentPermission, requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";

type Params = { params: Promise<{ orgId: string }> };
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:read");
    const agentId = req.nextUrl.searchParams.get("agentId");
    if (agentId) {
      if (!/^[0-9a-f-]{36}$/i.test(agentId)) return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
      const agent = await requireAgentPermission(auth, agentId, "project:read");
      if (agent.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to this organisation" }, { status: 403 });
    }
    const [servers, limits] = await Promise.all([
      query(`SELECT s.id, s.server_key AS "serverKey", s.display_name AS "displayName",
                    s.description, s.transport_type AS "transportType", s.endpoint_url AS "endpointUrl",
                    s.auth_mode AS "authMode", s.allowed_plans AS "allowedPlans",
                    c.status AS "connectionStatus", c.last_connected_at AS "lastConnectedAt",
                    c.last_error_code AS "lastErrorCode",
                    COALESCE(jsonb_agg(jsonb_build_object('name', t.tool_name, 'approved', t.approved,
                      'allowedSurfaces', t.allowed_surfaces, 'organisationEnabled', COALESCE(g.enabled,false),
                      'agentEnabled', COALESCE(ag.enabled,false)))
                      FILTER (WHERE t.tool_name IS NOT NULL), '[]'::jsonb) AS tools
               FROM platform_mcp_servers s
               LEFT JOIN organisation_mcp_connections c ON c.server_id=s.id AND c.org_id=$1
               LEFT JOIN platform_mcp_tools t ON t.server_id=s.id AND t.approved=true
               LEFT JOIN organisation_mcp_tool_grants g ON g.org_id=$1 AND g.server_id=s.id AND g.tool_name=t.tool_name
               LEFT JOIN agent_mcp_tool_grants ag ON ag.org_id=$1 AND ag.server_id=s.id AND ag.tool_name=t.tool_name AND ag.agent_id=$2::uuid
              WHERE s.platform_enabled=true
              GROUP BY s.id,c.status,c.last_connected_at,c.last_error_code
              ORDER BY s.display_name`, [orgId, agentId]),
      resolveOrgPlanLimits(orgId),
    ]);
    const planId = limits.plan_id;
    return NextResponse.json({
      plan: { id: planId },
      servers: servers.map((s: {allowedPlans: unknown}) => ({
        ...s,
        planAllowed: Array.isArray(s.allowedPlans) && (s.allowedPlans.includes(planId) || s.allowedPlans.includes("*")),
      })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org MCP GET]", err);
    return NextResponse.json({ error: "Failed to load organisation MCP servers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId } = await params;
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "config:update");
    const body = await req.json() as {
      serverId?: string; action?: "connect"|"disconnect"|"grant-tool"|"grant-agent-tool";
      credentials?: { bearerToken?: string }; toolName?: string; enabled?: boolean; agentId?: string;
    };
    if (!body.serverId || !/^[0-9a-f-]{36}$/i.test(body.serverId) ||
        !["connect","disconnect","grant-tool","grant-agent-tool"].includes(body.action ?? "")) {
      return NextResponse.json({ error: "serverId and a supported action are required" }, { status: 400 });
    }
    const server = (await query<{
      id:string; auth_mode:string; allowed_plans:string[]; platform_enabled:boolean;
    }>(`SELECT id,auth_mode,allowed_plans,platform_enabled FROM platform_mcp_servers WHERE id=$1`, [body.serverId]))[0];
    if (!server) return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    const enablingAccess = body.action === "connect" || ((body.action === "grant-tool" || body.action === "grant-agent-tool") && body.enabled === true);
    if (!server.platform_enabled && enablingAccess) return NextResponse.json({ error: "MCP server is disabled by platform administration", code:"MCP_SERVER_DISABLED" }, { status: 403 });

    if (body.action === "connect") {
      let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
      try { limits = await resolveOrgPlanLimits(orgId); }
      catch { return NextResponse.json({ error: "MCP plan entitlement could not be verified" }, { status: 503 }); }
      if (!Array.isArray(server.allowed_plans) ||
          (!server.allowed_plans.includes(limits.plan_id) && !server.allowed_plans.includes("*"))) {
        return NextResponse.json({ error: `The ${limits.plan_id} plan cannot use this MCP server`, code:"PLAN_NOT_ENTITLED" }, { status: 402 });
      }
      if (server.auth_mode === "bearer" &&
          (typeof body.credentials?.bearerToken !== "string" ||
           body.credentials.bearerToken.trim().length < 8 || body.credentials.bearerToken.length > 8192)) {
        return NextResponse.json({ error: "A valid bearer token is required" }, { status: 400 });
      }
      if (server.auth_mode === "none" && body.credentials?.bearerToken) {
        return NextResponse.json({ error: "This MCP server does not accept tenant credentials" }, { status: 400 });
      }
      const secret = server.auth_mode === "bearer" ? JSON.stringify({ bearerToken: body.credentials!.bearerToken!.trim() }) : "{}";
      await query(
        `INSERT INTO organisation_mcp_connections(org_id,server_id,credentials_encrypted,status,connected_by,last_error_code,last_connected_at)
         VALUES($1,$2,pgp_sym_encrypt($3,$4),'configured',$5,NULL,NULL)
         ON CONFLICT(org_id,server_id) DO UPDATE SET credentials_encrypted=EXCLUDED.credentials_encrypted,
           status='configured',connected_by=EXCLUDED.connected_by,last_error_code=NULL,last_connected_at=now(),updated_at=now()`,
        [orgId, body.serverId, secret, ENCRYPTION_KEY, auth.user.id],
      );
      return NextResponse.json({ ok:true, connectionStatus:"configured" }, { status: 201 });
    }

    if (body.action === "disconnect") {
      await withTransaction(async client => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [orgId]);
        await client.query(
          `UPDATE organisation_mcp_connections SET credentials_encrypted=NULL,status='disconnected',
             last_error_code=NULL,updated_at=now() WHERE org_id=$1 AND server_id=$2`,
          [orgId, body.serverId],
        );
        await client.query(
          `UPDATE organisation_mcp_tool_grants SET enabled=false,updated_at=now()
             WHERE org_id=$1 AND server_id=$2`, [orgId, body.serverId],
        );
        await client.query(
          `UPDATE agent_mcp_tool_grants SET enabled=false,updated_at=now()
             WHERE org_id=$1 AND server_id=$2`, [orgId, body.serverId],
        );
      });
      return NextResponse.json({ ok:true, connectionStatus:"disconnected" });
    }

    if (!body.toolName || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(body.toolName) || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "toolName and enabled are required" }, { status: 400 });
    }
    const tool = (await query<{tool_name:string;approved:boolean}>(
      `SELECT tool_name,approved FROM platform_mcp_tools WHERE server_id=$1 AND tool_name=$2`,
      [body.serverId, body.toolName],
    ))[0];
    if (!tool?.approved) return NextResponse.json({ error: "This MCP tool has not been approved by platform administration", code:"MCP_TOOL_NOT_APPROVED" }, { status: 403 });
    if (body.action === "grant-tool") {
      if (body.enabled) {
        let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
        try { limits = await resolveOrgPlanLimits(orgId); }
        catch { return NextResponse.json({ error: "MCP plan entitlement could not be verified" }, { status: 503 }); }
        if (!Array.isArray(server.allowed_plans) || (!server.allowed_plans.includes(limits.plan_id) && !server.allowed_plans.includes("*"))) {
          return NextResponse.json({ error: "The current plan is not entitled to this MCP server", code: "PLAN_NOT_ENTITLED" }, { status: 402 });
        }
        const connection = (await query<{status:string}>(
          `SELECT status FROM organisation_mcp_connections WHERE org_id=$1 AND server_id=$2`,
          [orgId, body.serverId],
        ))[0];
        if (connection?.status !== "configured") return NextResponse.json({ error: "Connect this MCP server before granting tools" }, { status: 409 });
      }
      await query(
        `INSERT INTO organisation_mcp_tool_grants(org_id,server_id,tool_name,enabled,created_by)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(org_id,server_id,tool_name)
         DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
        [orgId, body.serverId, body.toolName, body.enabled, auth.user.id],
      );
      if (!body.enabled) await query(
        `UPDATE agent_mcp_tool_grants SET enabled=false,updated_at=now()
           WHERE org_id=$1 AND server_id=$2 AND tool_name=$3`,
        [orgId, body.serverId, body.toolName],
      );
      return NextResponse.json({ ok:true, enabled:body.enabled });
    }

    if (!body.agentId || !/^[0-9a-f-]{36}$/i.test(body.agentId)) {
      return NextResponse.json({ error: "agentId is required for an agent tool grant" }, { status: 400 });
    }
    const agent = await requireAgentPermission(auth, body.agentId, body.enabled ? "config:update" : "project:update");
    if (agent.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to this organisation" }, { status: 403 });
    if (body.enabled) {
      let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
      try { limits = await resolveOrgPlanLimits(orgId); }
      catch { return NextResponse.json({ error: "MCP plan entitlement could not be verified" }, { status: 503 }); }
      if (!Array.isArray(server.allowed_plans) || (!server.allowed_plans.includes(limits.plan_id) && !server.allowed_plans.includes("*"))) {
        return NextResponse.json({ error: "The current plan is not entitled to this MCP server", code: "PLAN_NOT_ENTITLED" }, { status: 402 });
      }
    }
    const [orgGrant, connection] = await Promise.all([
      query<{enabled:boolean}>(`SELECT enabled FROM organisation_mcp_tool_grants WHERE org_id=$1 AND server_id=$2 AND tool_name=$3`,[orgId,body.serverId,body.toolName]),
      query<{status:string}>(`SELECT status FROM organisation_mcp_connections WHERE org_id=$1 AND server_id=$2`,[orgId,body.serverId]),
    ]);
    if (body.enabled && (!orgGrant[0]?.enabled || connection[0]?.status !== "configured")) {
      return NextResponse.json({ error: "Organisation connection and tool grant are required before enabling this agent tool" }, { status: 409 });
    }
    await query(
      `INSERT INTO agent_mcp_tool_grants(org_id,agent_id,server_id,tool_name,enabled,created_by)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(agent_id,server_id,tool_name)
       DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
      [orgId,body.agentId,body.serverId,body.toolName,body.enabled,auth.user.id],
    );
    return NextResponse.json({ ok:true, enabled:body.enabled });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org MCP POST]", err);
    return NextResponse.json({ error: "Failed to update organisation MCP configuration" }, { status: 500 });
  }
}
