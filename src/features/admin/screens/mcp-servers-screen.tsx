"use client";
import { useEffect, useState } from "react";
import { Cable, CheckCircle2, CircleSlash, Plus, ShieldCheck, ShieldOff, Wrench, X } from "lucide-react";

type McpTool = { name:string; approved:boolean; allowedSurfaces:string[] };
type McpServer = { id:string; serverKey:string; displayName:string; description:string; endpointUrl:string; authMode:"none"|"bearer"; platformEnabled:boolean; allowedPlans:string[]; tools:McpTool[] };

export default function McpServersScreen(){
 const [servers,setServers]=useState<McpServer[]>([]);
 const [showRegister,setShowRegister]=useState(false);
 const [serverKey,setServerKey]=useState(""); const [displayName,setDisplayName]=useState("");
 const [endpointUrl,setEndpointUrl]=useState(""); const [description,setDescription]=useState("");
 const [authMode,setAuthMode]=useState<"none"|"bearer">("bearer"); const [plans,setPlans]=useState("pro,enterprise");
 const [toolNames,setToolNames]=useState("");
 const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
 const [busy,setBusy]=useState<string|null>(null);

 async function load(){const r=await fetch("/api/platform/mcp-servers",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load MCP servers");setServers(d.servers??[])}
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);

 function resetForm(){setServerKey("");setDisplayName("");setEndpointUrl("");setDescription("");setToolNames("");setAuthMode("bearer");setPlans("pro,enterprise")}
 function closeRegister(){setShowRegister(false);resetForm();setError(null)}

 async function create(){
  setBusy("new");setError(null);setNotice(null);
  try{
   const tools=toolNames.split(/[\n,]/).map(s=>s.trim()).filter(Boolean).map(name=>({name,approved:false,allowedSurfaces:["chat","realtime"]}));
   const r=await fetch("/api/platform/mcp-servers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serverKey,displayName,endpointUrl,description,authMode,allowedPlans:plans.split(",").map(s=>s.trim()).filter(Boolean),transportType:"streamable_http",platformEnabled:false,tools})});
   const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not create MCP server");
   closeRegister();await load();setNotice("MCP server registered disabled. Review the tool allowlist and enable it when ready.");
  }catch(e){setError(e instanceof Error?e.message:"Could not create MCP server")}finally{setBusy(null)}
 }
 async function patch(s:McpServer,body:Record<string,unknown>,message="MCP configuration updated."){
  setBusy(s.id);setError(null);setNotice(null);
  try{const r=await fetch("/api/platform/mcp-servers",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:s.id,...body})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not update MCP server");await load();setNotice(message)}
  catch(e){setError(e instanceof Error?e.message:"Could not update MCP server")}finally{setBusy(null)}
 }

 return <div className="min-w-0 space-y-6">
  <div className="min-w-0">
   <h1 className="text-xl sm:text-2xl font-semibold">MCP servers</h1>
   <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Register platform-approved Model Context Protocol servers and manage their tool allowlists. Servers stay disabled until you review and approve their tools.</p>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div>}

  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
   <p className="text-sm text-muted-foreground">{servers.length} registered · {servers.filter(s=>s.platformEnabled).length} enabled</p>
   <button onClick={()=>setShowRegister(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"><Plus className="h-4 w-4"/>Register server</button>
  </div>

  {!servers.length&&!error&&<div className="rounded-2xl border border-dashed border-border p-10 text-center sm:p-14">
   <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><Cable className="h-6 w-6 text-primary"/></div>
   <h2 className="mt-4 text-base font-semibold">No MCP servers registered</h2>
   <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Register a Streamable HTTP MCP server, review its tools, then enable it for organisations on Pro and Enterprise plans.</p>
   <button onClick={()=>setShowRegister(true)} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4"/>Register your first server</button>
  </div>}

  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
   {servers.map(s=>{
    const approvedCount=s.tools.filter(t=>t.approved).length;
    return <div key={s.id} className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
     <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><Cable className="h-5 w-5 text-primary"/></div>
      <div className="min-w-0 flex-1">
       <h2 className="truncate font-semibold" title={s.displayName}>{s.displayName}</h2>
       <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.serverKey} · Streamable HTTP · {s.authMode==="bearer"?"org bearer token":"no auth"}</p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${s.platformEnabled?"border-emerald-500/20 bg-emerald-500/10 text-emerald-600":"border-border bg-muted text-muted-foreground"}`}>{s.platformEnabled?<><CheckCircle2 className="h-3 w-3"/>Enabled</>:<><CircleSlash className="h-3 w-3"/>Disabled</>}</span>
     </div>
     <p className="mt-3 min-h-10 break-all text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.endpointUrl}</p>
     {s.description&&<p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
     <p className="mt-2 text-xs text-muted-foreground/80">Plans: {s.allowedPlans.join(", ")||"—"} · {approvedCount}/{s.tools.length} tools approved</p>

     <div className="mt-4 min-w-0 space-y-2 border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Wrench className="h-3.5 w-3.5"/>Tools</h3>
      {s.tools.map(t=><div key={t.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
       <div className="min-w-0"><p className="truncate font-mono text-xs font-medium" title={t.name}>{t.name}</p><p className="text-[11px] text-muted-foreground">{t.allowedSurfaces.join(", ")}</p></div>
       <button disabled={busy===s.id} onClick={()=>void patch(s,{tools:s.tools.map(x=>x.name===t.name?{...x,approved:!x.approved}:x)},`${t.name} ${t.approved?"approval revoked":"approved"}.`)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${t.approved?"border border-border hover:bg-muted":"bg-primary text-primary-foreground hover:bg-primary/90"}`}>{t.approved?"Revoke":"Approve"}</button>
      </div>)}
      {!s.tools.length&&<p className="text-xs text-muted-foreground">No tools declared. Add tool names when registering, or edit the server record.</p>}
     </div>

     <div className="mt-auto flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      <button disabled={busy===s.id} onClick={()=>void patch(s,{platformEnabled:!s.platformEnabled},`${s.displayName} ${s.platformEnabled?"disabled":"enabled"}.`)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${s.platformEnabled?"border border-border hover:bg-muted":"bg-primary text-primary-foreground hover:bg-primary/90"}`}>
       {s.platformEnabled?<><ShieldOff className="h-3.5 w-3.5"/>Disable server</>:<><ShieldCheck className="h-3.5 w-3.5"/>Enable server</>}
      </button>
     </div>
    </div>;
   })}
  </div>

  {/* Register dialog */}
  {showRegister&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="mcp-register-title" className="my-auto box-border max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-xl overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
   <div className="flex min-w-0 items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
     <div className="shrink-0 rounded-xl bg-primary/10 p-2"><Cable className="h-5 w-5 text-primary"/></div>
     <div className="min-w-0"><h2 id="mcp-register-title" className="text-lg font-semibold">Register MCP server</h2><p className="mt-1 text-sm text-muted-foreground">The server is registered disabled. Review its tool allowlist before enabling it for organisations.</p></div>
    </div>
    <button onClick={closeRegister} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4"/></button>
   </div>
   <div className="mt-4 grid gap-4 sm:grid-cols-2">
    <label className="block space-y-1.5"><span className="text-sm font-medium">Server key *</span><input value={serverKey} onChange={e=>setServerKey(e.target.value)} placeholder="my-mcp-server" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Lowercase letters, digits, dashes and underscores.</span></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Display name *</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Company knowledge tools" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/></label>
    <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">HTTPS endpoint *</span><input value={endpointUrl} onChange={e=>setEndpointUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Streamable HTTP transport. Public HTTPS DNS host required — private and link-local addresses are rejected.</span></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Authentication</span><select value={authMode} onChange={e=>setAuthMode(e.target.value as "none"|"bearer")} className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"><option value="bearer">Organisation-provided bearer token</option><option value="none">No credentials</option></select></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Allowed plans</span><input value={plans} onChange={e=>setPlans(e.target.value)} placeholder="pro,enterprise" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Comma-separated plan IDs, or * for all plans.</span></label>
    <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">Description</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} className="w-full min-w-0 resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/></label>
    <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">Known tool names</span><textarea value={toolNames} onChange={e=>setToolNames(e.target.value)} placeholder={"search_documents\ncreate_ticket"} rows={3} className="w-full min-w-0 resize-y rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Comma or newline separated. Tools start unapproved — approve only names confirmed in the server’s actual tools/list output; runtime discovery rechecks names and schemas.</span></label>
   </div>
   <div className="mt-6 flex min-w-0 flex-wrap items-center justify-end gap-2">
    <button onClick={closeRegister} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
    <button onClick={()=>void create()} disabled={busy==="new"||!serverKey.trim()||!displayName.trim()||!endpointUrl.trim()} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy==="new"?"Saving…":"Register disabled server"}</button>
   </div>
  </div></div>}
 </div>
}
