"use client";
import { useEffect, useState } from "react";

type McpTool = { name:string; approved:boolean; allowedSurfaces:string[] };
type McpServer = { id:string; serverKey:string; displayName:string; description:string; endpointUrl:string; authMode:"none"|"bearer"; platformEnabled:boolean; allowedPlans:string[]; tools:McpTool[] };
export default function McpServersPanel() {
 const [servers,setServers]=useState<McpServer[]>([]);
 const [serverKey,setServerKey]=useState(""); const [displayName,setDisplayName]=useState("");
 const [endpointUrl,setEndpointUrl]=useState(""); const [description,setDescription]=useState("");
 const [authMode,setAuthMode]=useState<"none"|"bearer">("bearer"); const [plans,setPlans]=useState("pro,enterprise");
 const [toolNames,setToolNames]=useState(""); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null); const [busy,setBusy]=useState(false);
 async function load(){const r=await fetch("/api/platform/mcp-servers",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load MCP servers");setServers(d.servers??[])}
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 async function create(){setBusy(true);setError(null);setNotice(null);try{
  const tools=toolNames.split(/[\n,]/).map(s=>s.trim()).filter(Boolean).map(name=>({name,approved:false,allowedSurfaces:["chat","realtime"]}));
  const r=await fetch("/api/platform/mcp-servers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serverKey,displayName,endpointUrl,description,authMode,allowedPlans:plans.split(",").map(s=>s.trim()).filter(Boolean),transportType:"streamable_http",platformEnabled:false,tools})});
  const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not create MCP server");
  setServerKey("");setDisplayName("");setEndpointUrl("");setDescription("");setToolNames("");await load();setNotice("MCP server registered disabled. Review the tool allowlist and enable it when ready.");
 }catch(e){setError(e instanceof Error?e.message:"Could not create MCP server")}finally{setBusy(false)}}
 async function patch(s:McpServer, body:Record<string,unknown>){setBusy(true);setError(null);setNotice(null);try{const r=await fetch("/api/platform/mcp-servers",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:s.id,...body})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not update MCP server");await load();setNotice("MCP configuration updated.")}catch(e){setError(e instanceof Error?e.message:"Could not update MCP server")}finally{setBusy(false)}}
 return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
  <div><h2 className="text-lg font-semibold">MCP Servers</h2><p className="mt-1 text-sm text-muted-foreground">Register platform-approved Model Context Protocol servers. Streamable HTTP discovery and Chat/OpenAI realtime dispatch are now implemented in source but have not been tested against a live MCP server. Keep servers disabled until focused tests and a controlled handshake are verified.</p></div>
  {error&&<p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</p>}
  <div className="grid gap-3 md:grid-cols-2">
   <label className="text-sm">Server key<input value={serverKey} onChange={e=>setServerKey(e.target.value)} placeholder="my-mcp-server" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"/></label>
   <label className="text-sm">Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Company knowledge tools" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"/></label>
   <label className="text-sm md:col-span-2">HTTPS endpoint<input value={endpointUrl} onChange={e=>setEndpointUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"/></label>
   <label className="text-sm">Authentication<select value={authMode} onChange={e=>setAuthMode(e.target.value as "none"|"bearer")} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="bearer">Organisation-provided bearer token</option><option value="none">No credentials</option></select></label>
   <label className="text-sm">Allowed plans (comma separated)<input value={plans} onChange={e=>setPlans(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"/></label>
   <label className="text-sm">Description<textarea value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" rows={2}/></label>
   <label className="text-sm">Known tool names (comma or newline separated)<textarea value={toolNames} onChange={e=>setToolNames(e.target.value)} placeholder="search_documents\ncreate_ticket" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" rows={2}/><span className="text-xs text-muted-foreground">Tools start unapproved. Approve only names confirmed in the server’s actual tools/list output; runtime discovery rechecks names and schemas.</span></label>
  </div>
  <button disabled={busy||!serverKey.trim()||!displayName.trim()||!endpointUrl.trim()} onClick={()=>void create()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy?"Saving…":"Register disabled MCP server"}</button>
  <div className="space-y-3">{servers.map(s=><div key={s.id} className="rounded-xl border border-border p-4">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{s.displayName} <span className="text-xs text-muted-foreground">({s.serverKey})</span></h3><p className="mt-1 break-all text-xs text-muted-foreground">{s.endpointUrl}</p><p className="mt-1 text-xs text-muted-foreground">Streamable HTTP · {s.authMode} · plans: {s.allowedPlans.join(", ")}</p></div><button disabled={busy} onClick={()=>void patch(s,{platformEnabled:!s.platformEnabled})} className="rounded-lg border border-border px-3 py-2 text-xs">{s.platformEnabled?"Disable server":"Enable server"}</button></div>
   <div className="mt-3 space-y-2">{s.tools.map(t=><div key={t.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"><div><p className="text-sm font-medium">{t.name}</p><p className="text-xs text-muted-foreground">{t.allowedSurfaces.join(", ")}</p></div><button disabled={busy} onClick={()=>void patch(s,{tools:s.tools.map(x=>x.name===t.name?{...x,approved:!x.approved}:x)})} className="rounded-md border border-border px-3 py-1.5 text-xs">{t.approved?"Revoke approval":"Approve tool"}</button></div>)}</div>
  </div>)}</div>
 </section>
}
