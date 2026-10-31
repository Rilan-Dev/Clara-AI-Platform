"use client";
import {useEffect,useState} from "react";
import {toast} from "@/components/ui/sonner";
import {fetchOrgRetrievalPolicy,patchOrgRetrievalPolicy,fetchAgentRetrievalSettings,patchAgentRetrievalDraft,
  type OrgRetrievalPolicyDTO,type AgentRetrievalSettingsDTO,type RetrievalModeChoice} from "@/modules/admin-ui/api";

const modes:readonly RetrievalModeChoice[]=["vector","hybrid","graph"];
const names:Record<RetrievalModeChoice,string>={vector:"Vector — customer support",hybrid:"Hybrid — vector + graph",graph:"Graph — relationships"};

export function OrgRetrievalSettings({orgId}:{orgId:string}){
  const [data,setData]=useState<OrgRetrievalPolicyDTO|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{let active=true;setData(null);setError(null);
    fetchOrgRetrievalPolicy(orgId).then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError((e as Error).message)});
    return()=>{active=false};},[orgId]);
  const save=async(next:OrgRetrievalPolicyDTO)=>{setSaving(true);setError(null);
    try{setData(await patchOrgRetrievalPolicy(orgId,next));toast.success("Retrieval policy saved")}
    catch(e){setError((e as Error).message);toast.error("Could not save retrieval policy")}
    finally{setSaving(false)}};
  return <section aria-label="Organization retrieval settings" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <h2 className="text-sm font-semibold">Knowledge retrieval strategies</h2>
    <p className="mt-1 text-xs text-muted-foreground">Choose strategies available to this organization's agents. Vector remains enabled; graph publication requires verification.</p>
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {data?<div className="mt-3 space-y-3">
      {modes.map(mode=><label key={mode} className="flex items-center gap-2 text-xs">
        <input type="checkbox" disabled={mode==="vector"||saving} checked={data.allowedModes.includes(mode)}
          onChange={e=>{const allowed=e.target.checked?[...data.allowedModes,mode]:data.allowedModes.filter(m=>m!==mode);
            void save({...data,allowedModes:allowed,defaultMode:allowed.includes(data.defaultMode)?data.defaultMode:"vector"});}}/>{names[mode]}
      </label>)}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Organization default
        <select disabled={saving} value={data.defaultMode} className="max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          onChange={e=>void save({...data,defaultMode:e.target.value as RetrievalModeChoice})}>
          {data.allowedModes.map(m=><option key={m} value={m}>{names[m]}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Defaults do not change existing published agents.</p>
    </div>:<p className="mt-3 text-xs text-muted-foreground">Loading retrieval policy…</p>}
  </section>;
}
export function AgentRetrievalSettings({agentId}:{agentId:string}){
  const [data,setData]=useState<AgentRetrievalSettingsDTO|null>(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;setData(null);setError(null);
    fetchAgentRetrievalSettings(agentId).then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError((e as Error).message)});
    return()=>{active=false};},[agentId]);
  const save=async(draftMode:RetrievalModeChoice)=>{if(!data)return;setSaving(true);setError(null);
    try{const result=await patchAgentRetrievalDraft(agentId,draftMode);
      setData({...data,...result});toast.success("Retrieval draft saved")}
    catch(e){setError((e as Error).message);toast.error("Could not save retrieval draft")}
    finally{setSaving(false)}};
  return <section aria-label="Agent retrieval settings" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
    <h2 className="text-sm font-semibold">Knowledge retrieval</h2>
    <p className="mt-1 text-xs text-muted-foreground">Draft selection only. Published Graph and Hybrid modes require verified graph and KB snapshot parity.</p>
    {error&&<p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {data?<div className="mt-3 space-y-2 text-xs text-muted-foreground">
      <label className="flex flex-col gap-1">Draft strategy
        <select disabled={saving} value={data.policy.draftMode}
          className="max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          onChange={e=>void save(e.target.value as RetrievalModeChoice)}>
          {data.org.allowedModes.map(m=><option key={m} value={m}>{names[m]}</option>)}
        </select>
      </label>
      <p>Published: <strong className="text-foreground">{names[data.policy.publishedMode]}</strong></p>
      {data.preview.reason&&<p>Preview uses vector until graph readiness is verified.</p>}
    </div>:<p className="mt-3 text-xs text-muted-foreground">Loading retrieval policy…</p>}
  </section>;
}
