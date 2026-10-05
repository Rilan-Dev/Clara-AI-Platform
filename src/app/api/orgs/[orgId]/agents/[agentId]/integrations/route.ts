import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { listIntegrations } from "@/modules/integrations/registry";

type Params = { params: Promise<{ orgId: string; agentId: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "project:read");
    if (access.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    const rows = await query<{integration_id:string;enabled:boolean}>(`SELECT integration_id, enabled FROM agent_integrations WHERE agent_id=$1`, [agentId]);
    const orgRows = await query<{integration_id:string;enabled:boolean}>(`SELECT integration_id,enabled FROM organisation_integrations WHERE org_id=$1 AND enabled=true`, [orgId]);
    const connections = await query<{integration_id:string;count:number}>(`SELECT integration_id,COUNT(*)::int count FROM integration_connections WHERE org_id=$1 AND status='active' AND (agent_id=$2 OR agent_id IS NULL) GROUP BY integration_id`, [orgId,agentId]);
    const granted = new Map(rows.map(r=>[r.integration_id,r.enabled]));
    const orgEnabled = new Set(orgRows.map(r=>r.integration_id));
    const connected = new Map(connections.map(r=>[r.integration_id,r.count]));
    return NextResponse.json({ integrations: listIntegrations().map(def=>({
      ...def, organisationEnabled: orgEnabled.has(def.id), agentEnabled: granted.get(def.id) ?? false, connected:(connected.get(def.id)??0)>0,
    }))});
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
    if(!platform?.enabled||!org?.enabled)return NextResponse.json({error:"Integration is not enabled for this organisation",code:"INTEGRATION_NOT_AVAILABLE"},{status:403});
    const def=listIntegrations().find(i=>i.id===body.integrationId);
    if(!def)return NextResponse.json({error:"Integration not found"},{status:404});
    await query(`INSERT INTO agent_integrations(agent_id,integration_id,enabled,created_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(agent_id,integration_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
      [agentId,body.integrationId,body.enabled,auth.user.id]);
    return NextResponse.json({ok:true,integrationId:body.integrationId,enabled:body.enabled});
  }catch(err){if(err instanceof NextResponse)return err;console.error("[agent integrations PATCH]",err);return NextResponse.json({error:"Failed to update agent integration"},{status:500});}
}
