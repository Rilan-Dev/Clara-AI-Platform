import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission, requireOrgPermission } from "@/modules/auth/core/rbac";
import { getAgentById, getOrganisationById } from "@/modules/organisations/core/db";
import {
  getOrgRetrievalPolicy,getAgentRetrievalPolicy,setOrgRetrievalPolicy,setAgentDraftRetrievalMode,
  isRetrievalMode,validateOrgModes,resolveAllowedRetrievalMode,
} from "../core/retrieval-policy";

function fail(error: unknown, action: string): NextResponse {
  if (error instanceof NextResponse) return error;
  console.error("[retrieval-policy]", action, error);
  return NextResponse.json({error:"Unable to process retrieval settings."},{status:500,headers:{"Cache-Control":"private, no-store"}});
}
function invalid(error:string):NextResponse {
  return NextResponse.json({error},{status:400,headers:{"Cache-Control":"private, no-store"}});
}
function json(value:unknown):NextResponse {
  return NextResponse.json(value,{headers:{"Cache-Control":"private, no-store"}});
}
export async function getOrgRetrievalHandler(req:NextRequest,orgId:string):Promise<NextResponse>{
  try {
    await ensureMigrated();
    const auth=await requireAuth(req);
    await requireOrgPermission(auth,orgId,"org:read");
    if(!await getOrganisationById(orgId)) return NextResponse.json({error:"Organization not found"},{status:404});
    return json(await getOrgRetrievalPolicy(orgId));
  }catch(error){return fail(error,"get org");}
}
export async function patchOrgRetrievalHandler(req:NextRequest,orgId:string):Promise<NextResponse>{
  try {
    await ensureMigrated();
    const auth=await requireAuth(req);
    await requireOrgPermission(auth,orgId,"org:update");
    if(!await getOrganisationById(orgId)) return NextResponse.json({error:"Organization not found"},{status:404});
    const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
    if(!body || !isRetrievalMode(body.defaultMode)) return invalid("A valid defaultMode is required.");
    try {validateOrgModes(body.allowedModes,body.defaultMode);}
    catch {return invalid("Allowed modes must be unique, contain vector and include defaultMode.");}
    try {
      return json(await setOrgRetrievalPolicy(orgId,{defaultMode:body.defaultMode,allowedModes:body.allowedModes as ("vector"|"hybrid"|"graph")[]}));
    }catch(error) {
      if(error instanceof Error && error.message.includes("published agent")) return NextResponse.json({error:"Published agents use a mode being removed."},{status:409});
      throw error;
    }
  }catch(error){return fail(error,"patch org");}
}
export async function getAgentRetrievalHandler(req:NextRequest,agentId:string):Promise<NextResponse>{
  try {
    await ensureMigrated();
    const auth=await requireAuth(req);
    const scope=await requireAgentPermission(auth,agentId,"project:read");
    const agent=await getAgentById(agentId);
    if(!agent || agent.orgId!==scope.orgId) return NextResponse.json({error:"Agent not found"},{status:404});
    const [org,policy]=await Promise.all([getOrgRetrievalPolicy(scope.orgId),getAgentRetrievalPolicy(agentId,scope.orgId)]);
    return json({org,policy,preview:resolveAllowedRetrievalMode({org,agent:policy,draft:true,graphReady:false}),
      live:resolveAllowedRetrievalMode({org,agent:policy,draft:false,graphReady:false}),
      graphReady:false,graphStatus:"verification_pending"});
  }catch(error){return fail(error,"get agent");}
}
export async function patchAgentRetrievalHandler(req:NextRequest,agentId:string):Promise<NextResponse>{
  try {
    await ensureMigrated();
    const auth=await requireAuth(req);
    const scope=await requireAgentPermission(auth,agentId,"project:update");
    const agent=await getAgentById(agentId);
    if(!agent || agent.orgId!==scope.orgId) return NextResponse.json({error:"Agent not found"},{status:404});
    const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
    if(!body || !isRetrievalMode(body.draftMode)) return invalid("A valid draftMode is required.");
    const org=await getOrgRetrievalPolicy(scope.orgId);
    if(!org.allowedModes.includes(body.draftMode)) return NextResponse.json({error:"Mode not enabled for this organization."},{status:403});
    const policy=await setAgentDraftRetrievalMode(agentId,scope.orgId,body.draftMode);
    return json({policy,preview:resolveAllowedRetrievalMode({org,agent:policy,draft:true,graphReady:false})});
  }catch(error){return fail(error,"patch agent");}
}
