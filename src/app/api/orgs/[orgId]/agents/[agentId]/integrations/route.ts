import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { listIntegrations } from "@/modules/integrations/registry";
import { getOrgPlanLimits, resolveOrgPlanLimits } from "@/lib/plan-guard";

type Params = { params: Promise<{ orgId: string; agentId: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "project:read");
    if (access.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    const [rows, orgRows, connections, platform, limits] = await Promise.all([
      query<{integration_id:string;enabled:boolean}>(`SELECT integration_id, enabled FROM agent_integrations WHERE agent_id=$1`, [agentId]),
      query<{integration_id:string;enabled:boolean}>(`SELECT integration_id,enabled FROM organisation_integrations WHERE org_id=$1 AND enabled=true`, [orgId]),
      query<{
        integration_id:string;
        active_count:number;
        expired_count:number;
        error_count:number;
        revoked_count:number;
        last_updated_at:Date|null;
      }>(`SELECT integration_id,
                 COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
                 COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_count,
                 COUNT(*) FILTER (WHERE status = 'error')::int AS error_count,
                 COUNT(*) FILTER (WHERE status = 'revoked')::int AS revoked_count,
                 MAX(updated_at) AS last_updated_at
            FROM integration_connections
           WHERE org_id=$1 AND (agent_id=$2 OR agent_id IS NULL)
           GROUP BY integration_id`, [orgId,agentId]),
      // Platform enablement gates what an agent admin may even see: the full
      // catalogue is intentionally NOT exposed on the agent integrations page.
      query<{integration_id:string;enabled:boolean;allowed_plans:string[]}>(`SELECT integration_id, enabled, allowed_plans FROM platform_integrations`, []),
      getOrgPlanLimits(orgId),
    ]);
    const granted = new Map(rows.map(r=>[r.integration_id,r.enabled]));
    const orgEnabled = new Set(orgRows.map(r=>r.integration_id));
    const connById = new Map(connections.map(r=>[r.integration_id,r]));
    const platformById = new Map(platform.map(r=>[r.integration_id,r]));
    const planId = limits.plan_id;
    return NextResponse.json({
      plan: { id: planId },
      integrations: listIntegrations().filter(def => {
        const isPlatformEnabled = platformById.get(def.id)?.enabled ?? false;
        // Keep already-granted items visible after platform disablement or a
        // plan change so existing access can be inspected and revoked here;
        // everything else must be platform-enabled to appear at all.
        return isPlatformEnabled || orgEnabled.has(def.id) || (granted.get(def.id) ?? false);
      }).map(def=>{
        const conn = connById.get(def.id);
        return {
          ...def,
          platformEnabled: platformById.get(def.id)?.enabled ?? false,
          planAllowed: (() => {
            const allowed = platformById.get(def.id)?.allowed_plans;
            return Array.isArray(allowed) && (allowed.includes(planId) || allowed.includes("*"));
          })(),
          organisationEnabled: orgEnabled.has(def.id),
          agentEnabled: granted.get(def.id) ?? false,
          connected:(conn?.active_count??0)>0,
          connectionStatus: (conn?.active_count ?? 0) > 0
            ? "connected"
            : (conn?.expired_count ?? 0) > 0
              ? "expired"
              : (conn?.error_count ?? 0) > 0
                ? "error"
                : (conn?.revoked_count ?? 0) > 0
                  ? "revoked"
                  : "disconnected",
          connectionUpdatedAt: conn?.last_updated_at ?? null,
        };
      }),
    });
  } catch(err){ if(err instanceof NextResponse)return err; console.error("[agent integrations GET]",err); return NextResponse.json({error:"Failed to load agent integrations"},{status:500}); }
}

export async function PATCH(req: NextRequest,{params}:Params){
  try{
    await ensureMigrated();
    const {orgId,agentId}=await params;
    const auth=await requireAuth(req);
    const access=await requireAgentPermission(auth,agentId,"project:update");
    if(access.orgId!==orgId)return NextResponse.json({error:"Agent does not belong to organisation"},{status:403});
    const body=await req.json() as {integrationId?:string;enabled?:boolean};
    if(!body.integrationId||typeof body.enabled!=="boolean")return NextResponse.json({error:"integrationId and enabled are required"},{status:400});
    const platform=(await query<{enabled:boolean;allowed_plans:string[]}>(`SELECT enabled,allowed_plans FROM platform_integrations WHERE integration_id=$1`,[body.integrationId]))[0];
    const org=(await query<{enabled:boolean}>(`SELECT enabled FROM organisation_integrations WHERE org_id=$1 AND integration_id=$2`,[orgId,body.integrationId]))[0];
    // Enabling requires both platform and organisation enablement. Revoking an
    // existing grant must stay possible after the platform disables the
    // integration or the organisation withdraws its grant, so tenants can
    // safely unwind access they can no longer use (mirrors the MCP route's
    // enablingAccess boundary).
    if(body.enabled&&(!platform?.enabled||!org?.enabled))return NextResponse.json({error:"Integration is not enabled for this organisation",code:"INTEGRATION_NOT_AVAILABLE"},{status:403});
    // A plan entitlement is required to enable a new agent grant. Disabling an
    // existing grant must remain possible after a downgrade so tenants can
    // safely unwind access they are no longer entitled to use.
    if (body.enabled) {
      let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
      try {
        limits = await resolveOrgPlanLimits(orgId);
      } catch {
        return NextResponse.json({error:"Integration plan entitlement could not be verified"},{status:503});
      }
      if (
        !Array.isArray(platform.allowed_plans) ||
        (!platform.allowed_plans.includes(limits.plan_id) && !platform.allowed_plans.includes("*"))
      ) {
        return NextResponse.json({error:`The ${limits.plan_id} plan cannot use this integration`,code:"PLAN_NOT_ENTITLED"},{status:402});
      }
    }
    const def=listIntegrations().find(i=>i.id===body.integrationId);
    if(!def)return NextResponse.json({error:"Integration not found"},{status:404});
    await query(`INSERT INTO agent_integrations(agent_id,integration_id,enabled,created_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(agent_id,integration_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
      [agentId,body.integrationId,body.enabled,auth.user.id]);
    return NextResponse.json({ok:true,integrationId:body.integrationId,enabled:body.enabled});
  }catch(err){if(err instanceof NextResponse)return err;console.error("[agent integrations PATCH]",err);return NextResponse.json({error:"Failed to update agent integration"},{status:500});}
}
