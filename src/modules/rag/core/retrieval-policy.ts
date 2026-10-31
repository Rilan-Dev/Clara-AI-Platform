import { queryOne, query } from "@/lib/db";

export type RetrievalMode = "vector" | "hybrid" | "graph";
export const RETRIEVAL_MODES: readonly RetrievalMode[] = ["vector", "hybrid", "graph"];
export type OrgRetrievalPolicy = {
  orgId: string; defaultMode: RetrievalMode; allowedModes: RetrievalMode[];
};
export type AgentRetrievalPolicy = {
  agentId: string; orgId: string; draftMode: RetrievalMode; publishedMode: RetrievalMode;
};
const defaults = (orgId: string): OrgRetrievalPolicy => ({orgId, defaultMode:"vector", allowedModes:["vector"]});
export function isRetrievalMode(value: unknown): value is RetrievalMode {
  return typeof value === "string" && RETRIEVAL_MODES.includes(value as RetrievalMode);
}
export function validateOrgModes(input: unknown, defaultMode: unknown): RetrievalMode[] {
  if (!Array.isArray(input) || !input.length || input.length>3 ||
    input.some(mode=>!isRetrievalMode(mode)) || new Set(input).size !== input.length ||
    !input.includes("vector") || !isRetrievalMode(defaultMode) || !input.includes(defaultMode))
    throw new Error("Allowed modes must be unique, contain vector and include the default mode.");
  return input as RetrievalMode[];
}
export async function getOrgRetrievalPolicy(orgId: string): Promise<OrgRetrievalPolicy> {
  const row = await queryOne<{default_mode:RetrievalMode;allowed_modes:RetrievalMode[]}>(
    "SELECT default_mode,allowed_modes FROM org_rag_policies WHERE org_id=$1",[orgId]);
  return row ? {orgId,defaultMode:row.default_mode,allowedModes:row.allowed_modes} : defaults(orgId);
}
export async function setOrgRetrievalPolicy(orgId: string,input:{defaultMode:RetrievalMode;allowedModes:RetrievalMode[]}):Promise<OrgRetrievalPolicy>{
  validateOrgModes(input.allowedModes,input.defaultMode);
  // Reject changes that would invalidate an already published agent's mode.
  const conflicts = await query<{agent_id:string}>(
    "SELECT agent_id FROM agent_rag_policies WHERE org_id=$1 AND NOT (published_mode = ANY($2::TEXT[])) LIMIT 1",
    [orgId,input.allowedModes]);
  if(conflicts.length) throw new Error("An existing published agent uses a mode that would be disallowed.");
  await query("INSERT INTO org_rag_policies(org_id,default_mode,allowed_modes) VALUES($1,$2,$3::TEXT[]) ON CONFLICT(org_id) DO UPDATE SET default_mode=EXCLUDED.default_mode,allowed_modes=EXCLUDED.allowed_modes",
    [orgId,input.defaultMode,input.allowedModes]);
  return {orgId,...input};
}
export async function getAgentRetrievalPolicy(agentId:string,orgId:string):Promise<AgentRetrievalPolicy>{
  const row=await queryOne<{draft_mode:RetrievalMode;published_mode:RetrievalMode}>(
    "SELECT draft_mode,published_mode FROM agent_rag_policies WHERE agent_id=$1 AND org_id=$2",[agentId,orgId]);
  return {agentId,orgId,draftMode:row?.draft_mode??"vector",publishedMode:row?.published_mode??"vector"};
}
export async function setAgentDraftRetrievalMode(agentId:string,orgId:string,mode:RetrievalMode):Promise<AgentRetrievalPolicy>{
  const org=await getOrgRetrievalPolicy(orgId);
  if(!org.allowedModes.includes(mode)) throw new Error("Retrieval mode is not allowed by this organization.");
  await query("INSERT INTO agent_rag_policies(agent_id,org_id,draft_mode) VALUES($1,$2,$3) ON CONFLICT(agent_id) DO UPDATE SET draft_mode=EXCLUDED.draft_mode WHERE agent_rag_policies.org_id=$2",
    [agentId,orgId,mode]);
  return getAgentRetrievalPolicy(agentId,orgId);
}
export function resolveAllowedRetrievalMode(params: {
  org:OrgRetrievalPolicy;agent:AgentRetrievalPolicy;draft:boolean;
  graphReady:boolean;
}):{configured:RetrievalMode;effective:RetrievalMode;reason?:string}{
  const configured=params.draft?params.agent.draftMode:params.agent.publishedMode;
  if(!params.org.allowedModes.includes(configured)) return {configured,effective:"vector",reason:"org_policy_restricted"};
  if(configured!=="vector" && !params.graphReady) return {configured,effective:"vector",reason:"graph_not_ready"};
  return {configured,effective:configured};
}
/** Runtime is authoritative, independent of user/LLM requested ragMode. */
export async function resolveKbRetrievalPolicy(params:{
  orgId:string|null;agentId:string|null;draft:boolean;
  graphReady:boolean;
}):Promise<{configured:RetrievalMode;effective:RetrievalMode;reason?:string}>{
  if(!params.orgId || !params.agentId) return {configured:"vector",effective:"vector",reason:"tenant_unresolved"};
  const [org,agent]=await Promise.all([
    getOrgRetrievalPolicy(params.orgId),
    getAgentRetrievalPolicy(params.agentId,params.orgId),
  ]);
  return resolveAllowedRetrievalMode({org,agent,draft:params.draft,graphReady:params.graphReady});
}
