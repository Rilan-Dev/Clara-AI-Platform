"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
type Item={
  id:string;displayName:string;description:string;logoUrl:string;
  organisationEnabled:boolean;agentEnabled:boolean;connected:boolean;
  planAllowed?:boolean;platformEnabled?:boolean;actions:string[];
};
export default function AgentIntegrationsScreen(){
 const {id="",agentId=""}=useParams<{id:string;agentId:string}>(); const [items,setItems]=useState<Item[]>([]); const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const load=()=>fetch(`/api/orgs/${id}/agents/${agentId}/integrations`,{cache:"no-store"}).then(r=>r.json()).then(d=>setItems(d.integrations??[])).catch(()=>setError("Could not load integrations"));
 useEffect(()=>{if(id&&agentId)void load()},[id,agentId]);
 async function toggle(item:Item){setBusy(item.id);setError(null);try{
  const response=await fetch(`/api/orgs/${id}/agents/${agentId}/integrations`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:item.id,enabled:!item.agentEnabled})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??"Could not update integration");
  await load();
 }catch(e){setError(e instanceof Error?e.message:"Could not update integration")}finally{setBusy(null)}}
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-semibold">Agent integrations</h1><p className="mt-1 text-sm text-muted-foreground">Choose exactly which organisation integrations this agent may use during Chat, Voice Chat and Realtime Voice tool calls.</p></div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</div>}
  <div className="grid gap-4 md:grid-cols-2">{items.map(i=><div key={i.id} className="rounded-2xl border border-border bg-card p-5">
   <div className="flex items-start gap-3">
    <img src={i.logoUrl} className="h-10 w-10 object-contain" alt=""/>
    <div className="flex-1"><h2 className="font-semibold">{i.displayName}</h2><p className="text-xs text-muted-foreground">{i.actions.length} actions · {i.connected?"credentials ready":"not connected"}</p></div>
    <button disabled={!i.organisationEnabled||!i.connected||busy===i.id} onClick={()=>void toggle(i)} className={`relative h-6 w-11 rounded-full ${i.agentEnabled?"bg-primary":"bg-muted"} disabled:opacity-40`} aria-label={`Toggle ${i.displayName}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${i.agentEnabled?"left-[1.4rem]":"left-0.5"}`}/></button>
   </div>
   <p className="mt-4 text-sm text-muted-foreground">{i.description}</p>
   {!i.planAllowed&&<p className="mt-3 text-xs text-muted-foreground">This integration is not available for this plan.</p>}
   {i.planAllowed&&!i.organisationEnabled&&<p className="mt-3 text-xs text-muted-foreground">This integration is not enabled for your organisation yet.</p>}
   {i.organisationEnabled&&!i.connected&&<p className="mt-3 text-xs text-amber-600">Connect this integration in Organisation → Integrations to let agents use it.</p>}
  </div>)}</div>
 </div>;
}
