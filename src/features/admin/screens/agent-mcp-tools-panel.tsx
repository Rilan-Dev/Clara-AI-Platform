"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
type Tool={name:string;approved:boolean;allowedSurfaces:string[];organisationEnabled:boolean;agentEnabled:boolean};
type Server={id:string;displayName:string;platformEnabled:boolean;planAllowed:boolean;connectionStatus:string|null;tools:Tool[]};
export default function AgentMcpToolsPanel(){
 const {id="",agentId=""}=useParams<{id:string;agentId:string}>();
 const [servers,setServers]=useState<Server[]>([]);const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState<string|null>(null);
 async function load(){const r=await fetch(`/api/orgs/${id}/mcp-servers?agentId=${agentId}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load MCP tools");setServers(d.servers??[])}
 useEffect(()=>{if(id&&agentId)void load().catch(e=>setError(e.message))},[id,agentId]);
 async function toggle(server:Server,tool:Tool){setBusy(server.id+tool.name);setError(null);try{const r=await fetch(`/api/orgs/${id}/mcp-servers`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serverId:server.id,action:"grant-agent-tool",agentId,toolName:tool.name,enabled:!tool.agentEnabled})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not update agent MCP grant");await load()}catch(e){setError(e instanceof Error?e.message:"Could not update agent MCP grant")}finally{setBusy(null)}}
 return <section className="space-y-4 rounded-2xl border border-border bg-card p-5"><div><h2 className="text-lg font-semibold">MCP tools for this agent</h2><p className="mt-1 text-sm text-muted-foreground">Grant only the approved tools this agent needs. Organisation connection and tool grants must already be configured.</p></div>
 {error&&<p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
 {!servers.length&&<p className="text-sm text-muted-foreground">No platform-approved MCP servers are currently available.</p>}
 {servers.map(s=><div key={s.id} className="rounded-xl border border-border p-4"><h3 className="font-medium">{s.displayName}</h3><p className="mt-1 text-xs text-muted-foreground">Connection: {s.connectionStatus??"not configured"}</p>
  {s.tools.filter(t=>t.approved).map(t=><div key={t.name} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"><div><p className="text-sm font-medium">{t.name}</p><p className="text-xs text-muted-foreground">{t.allowedSurfaces.join(", ")}</p>{!t.organisationEnabled&&<p className="text-xs text-amber-600">Organisation grant required</p>}</div><button disabled={busy===s.id+t.name||(!t.agentEnabled&&(!s.platformEnabled||!s.planAllowed||!["configured","connected"].includes(s.connectionStatus??"")||!t.organisationEnabled))} onClick={()=>void toggle(s,t)} className={`rounded-md px-3 py-1.5 text-xs ${t.agentEnabled?"border border-border":"bg-primary text-primary-foreground"} disabled:opacity-40`}>{t.agentEnabled?"Revoke agent grant":"Grant to agent"}</button></div>)}
 </div>)}
 </section>
}
