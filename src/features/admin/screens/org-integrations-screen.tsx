"use client";
import { useEffect, useState } from "react";
import { PlugZap, Lock, CheckCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
type Item={id:string;displayName:string;description:string;logoUrl:string;category:string;authType:string;platformEnabled:boolean;planAllowed:boolean;organisationEnabled:boolean;connected:boolean;actions:string[]};
export default function OrgIntegrationsScreen(){
 const {id=""}=useParams<{id:string}>(); const [items,setItems]=useState<Item[]>([]); const [plan,setPlan]=useState<{id:string;maxIntegrations:number}>({id:"free",maxIntegrations:0}); const [selected,setSelected]=useState<Item|null>(null); const [secret,setSecret]=useState(""); const [busy,setBusy]=useState<string|null>(null);
 const load=()=>fetch(`/api/orgs/${id}/integrations`,{cache:"no-store"}).then(r=>r.json()).then(d=>{setItems(d.integrations??[]);setPlan(d.plan??{id:"free",maxIntegrations:0})});
 useEffect(()=>{if(id)void load()},[id]);
 async function access(item:Item,enabled:boolean){setBusy(item.id);try{await fetch(`/api/orgs/${id}/integrations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:item.id,action:enabled?"enable":"disable"})});await load()}finally{setBusy(null)}}
 async function connect(){if(!selected)return;setBusy(selected.id);try{let credentials:unknown=secret;try{credentials=JSON.parse(secret)}catch{} await fetch(`/api/orgs/${id}/integrations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:selected.id,action:"connect",authType:selected.authType,credentials})});setSelected(null);setSecret("");await load()}finally{setBusy(null)}}
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-semibold">Organisation integrations</h1><p className="mt-1 text-sm text-muted-foreground">Enable integrations for this organisation, connect credentials, then grant each one to individual agents.</p></div>
  <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"><div><p className="text-sm font-medium">Plan allowance</p><p className="text-xs text-muted-foreground mt-1">{plan.id} · maximum {plan.maxIntegrations===-1?"unlimited":plan.maxIntegrations} enabled integrations</p></div><PlugZap className="h-5 w-5 text-primary"/></div>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(i=><div key={i.id} className="rounded-2xl border border-border bg-card p-5">
   <div className="flex gap-3"><img src={i.logoUrl} className="h-10 w-10 object-contain" alt=""/><div className="flex-1"><h2 className="font-semibold">{i.displayName}</h2><p className="text-xs text-muted-foreground">{i.category}</p></div></div>
   <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{i.description}</p>
   {!i.platformEnabled?<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5"/>Disabled by platform admin</div>:
   !i.planAllowed?<div className="mt-4 text-xs text-amber-600">Not included in the {plan.id} plan.</div>:
   <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy===i.id} onClick={()=>void access(i,!i.organisationEnabled)} className={`rounded-lg px-3 py-2 text-xs font-medium ${i.organisationEnabled?"border border-border":"bg-primary text-primary-foreground"}`}>{i.organisationEnabled?"Disable for organisation":"Enable for organisation"}</button>{i.organisationEnabled&&<button onClick={()=>setSelected(i)} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">{i.connected?"Reconnect":"Connect credentials"}</button>}</div>}
   {i.connected&&<div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5"/>Connected</div>}
  </div>)}</div>
  {selected&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"><h2 className="text-lg font-semibold">Connect {selected.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">Credentials are encrypted server-side. Never paste credentials into chat.</p><textarea value={secret} onChange={e=>setSecret(e.target.value)} rows={7} placeholder={selected.authType==="secret_text"?"Enter the secret/token":"Enter credential JSON"} className="mt-4 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/30"/><div className="mt-4 flex justify-end gap-2"><button onClick={()=>{setSelected(null);setSecret("")}} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button onClick={()=>void connect()} disabled={!secret||busy===selected.id} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Save connection</button></div></div></div>}
 </div>
}
