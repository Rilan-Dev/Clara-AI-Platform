"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, PlugZap, ShieldCheck, ShieldOff } from "lucide-react";

type Integration = { id:string; displayName:string; description:string; logoUrl:string; category:string; authType:string; actions:string[]; platformEnabled:boolean; allowedPlans:string[] };
export default function PlatformIntegrationsScreen(){
 const [items,setItems]=useState<Integration[]>([]); const [q,setQ]=useState(""); const [busy,setBusy]=useState<string|null>(null);
 const load=()=>fetch("/api/platform/integrations",{cache:"no-store"}).then(r=>r.json()).then(d=>setItems(d.integrations??[]));
 useEffect(()=>{void load()},[]);
 const filtered=useMemo(()=>items.filter(i=>[i.displayName,i.description,i.category].some(v=>v.toLowerCase().includes(q.toLowerCase()))),[items,q]);
 async function toggle(i:Integration){setBusy(i.id);try{await fetch("/api/platform/integrations",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:i.id,enabled:!i.platformEnabled})});await load()}finally{setBusy(null)}}
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-semibold">Integrations</h1><p className="mt-1 text-sm text-muted-foreground">Control which integrations the Clara platform makes available to organisations.</p></div>
  <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"><Search className="h-4 w-4 text-muted-foreground"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search integrations..." className="w-full bg-transparent text-sm outline-none"/></div>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(i=><div key={i.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
   <div className="flex items-start gap-3"><div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center overflow-hidden"><img src={i.logoUrl} alt="" className="h-8 w-8 object-contain"/></div><div className="min-w-0 flex-1"><h2 className="font-semibold">{i.displayName}</h2><p className="mt-0.5 text-xs text-muted-foreground">{i.category} · {i.authType}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${i.platformEnabled?"bg-emerald-500/10 text-emerald-600":"bg-muted text-muted-foreground"}`}>{i.platformEnabled?"Enabled":"Disabled"}</span></div>
   <p className="mt-4 text-sm text-muted-foreground line-clamp-2">{i.description}</p>
   <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{i.actions.length} supported actions</span><button onClick={()=>void toggle(i)} disabled={busy===i.id} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${i.platformEnabled?"border border-border hover:bg-muted":"bg-primary text-primary-foreground"}`}>{i.platformEnabled?<ShieldOff className="h-3.5 w-3.5"/>:<ShieldCheck className="h-3.5 w-3.5"/>}{i.platformEnabled?"Disable":"Enable"}</button></div>
  </div>)}</div>
  {!filtered.length&&<div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No integrations match your search.</div>}
 </div>
}
