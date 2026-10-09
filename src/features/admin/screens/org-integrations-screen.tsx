"use client";
import { useEffect, useMemo, useState } from "react";
import { PlugZap, Lock, CheckCircle2, KeyRound, Copy, ExternalLink } from "lucide-react";
import { useParams } from "next/navigation";

type CredentialField = { name: string; displayName: string; description?: string; type: "text" | "secret" | "dropdown"; required: boolean; options?: Array<{ label: string; value: string }> };
type Item = {
 id:string; displayName:string; description:string; logoUrl:string; category:string; authType:string;
 platformEnabled:boolean; planAllowed:boolean; organisationEnabled:boolean; connected:boolean; actions:string[];
 customAuthFields?: CredentialField[]; oauth2Config?: { authUrl:string; tokenUrl:string; scopes:string[] };
 requiresOAuthApp?:boolean; supportsUserProvidedCredentials?:boolean;
};
type Plan={id:string;maxIntegrations:number};
type FieldValue=string;

function credentialFields(item: Item): CredentialField[] {
 if (item.customAuthFields?.length) return item.customAuthFields;
 if (item.authType === "none") return [];
 if (item.authType === "secret_text") return [{name:"api_key",displayName:"API key / access token",type:"secret",required:true}];
 if (item.authType === "basic_auth") return [
  {name:"username",displayName:"Username",type:"text",required:true},
  {name:"password",displayName:"Password",type:"secret",required:true},
 ];
 if (item.authType === "oauth2") return [
  {name:"client_id",displayName:"OAuth Client ID",type:"text",required:true,description:"Client ID from the integration provider's developer console."},
  {name:"client_secret",displayName:"OAuth Client Secret",type:"secret",required:true,description:"Saved encrypted; never returned to the browser."},
  {name:"access_token",displayName:"Access Token (optional)",type:"secret",required:false,description:"Use this only if your provider supplies a token directly and the integration supports token-based authentication."},
  {name:"refresh_token",displayName:"Refresh Token (optional)",type:"secret",required:false},
 ];
 return [
  {name:"api_key",displayName:"API key",type:"secret",required:true},
  {name:"base_url",displayName:"Base URL (optional)",type:"text",required:false},
 ];
}

export default function OrgIntegrationsScreen(){
 const {id=""}=useParams<{id:string}>();
 const [items,setItems]=useState<Item[]>([]);
 const [plan,setPlan]=useState<Plan>({id:"free",maxIntegrations:0});
 const [selected,setSelected]=useState<Item|null>(null);
 const [values,setValues]=useState<Record<string,FieldValue>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const fields=useMemo(()=>selected?credentialFields(selected):[],[selected]);
 const callbackUrl=typeof window!=="undefined"?`${window.location.origin}/api/integrations/oauth/callback`:"/api/integrations/oauth/callback";
 const load=async()=>{
  const response=await fetch(`/api/orgs/${id}/integrations`,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error??"Could not load integrations");
  setItems(data.integrations??[]);setPlan(data.plan??{id:"free",maxIntegrations:0});
 };
 useEffect(()=>{
  if(id)void load().catch(e=>setError(e.message));
  const params=new URLSearchParams(window.location.search);
  const oauth=params.get("oauth");
  const integrationId=params.get("integrationId");
  if(oauth==="connected")setNotice(`OAuth connection completed for ${integrationId??"integration"}.`);
  else if(oauth==="cancelled")setError("The provider authorization was cancelled.");
  else if(oauth==="error")setError("The OAuth connection could not be completed. Check the platform OAuth configuration and try again.");
  if(oauth){params.delete("oauth");params.delete("integrationId");const suffix=params.toString();window.history.replaceState({}, "", window.location.pathname+(suffix?`?${suffix}`:""));}
 },[id]);
 async function access(item:Item,enabled:boolean){
  setBusy(item.id);setError(null);setNotice(null);
  try{const response=await fetch(`/api/orgs/${id}/integrations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:item.id,action:enabled?"enable":"disable"})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not update integration access");await load();setNotice(enabled?`${item.displayName} enabled for the organisation.`:`${item.displayName} disabled for the organisation.`)}
  catch(e){setError(e instanceof Error?e.message:"Could not update integration access")}finally{setBusy(null)}
 }
 async function startOAuth(item:Item){
  setBusy(item.id);setError(null);setNotice(null);
  try{
   const response=await fetch(`/api/orgs/${id}/integrations/${item.id}/oauth/start`,{headers:{Accept:"application/json"},cache:"no-store"});
   const data=await response.json();
   if(!response.ok||typeof data.authorizationUrl!=="string")throw new Error(data.error??"Could not start OAuth connection");
   window.location.assign(data.authorizationUrl);
  }catch(e){setError(e instanceof Error?e.message:"Could not start OAuth connection");setBusy(null)}
 }
 async function connect(){
  if(!selected)return;
  const missing=fields.filter(f=>f.required&&!values[f.name]?.trim());
  if(missing.length){setError(`Complete the required fields: ${missing.map(f=>f.displayName).join(", ")}`);return}
  const credentials=Object.fromEntries(Object.entries(values).filter(([,v])=>v.trim()).map(([k,v])=>[k,v.trim()]));
  setBusy(selected.id);setError(null);setNotice(null);
  try{
   const response=await fetch(`/api/orgs/${id}/integrations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:selected.id,action:"connect",credentials,displayName:selected.displayName})});
   const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not save integration credentials");
   const name=selected.displayName;setSelected(null);setValues({});await load();setNotice(`${name} credentials saved. You can now enable it for individual agents.`);
  }catch(e){setError(e instanceof Error?e.message:"Could not save integration credentials")}finally{setBusy(null)}
 }
 function openConnect(item:Item){setSelected(item);setValues({});setError(null);setNotice(null)}
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-semibold">Organisation integrations</h1><p className="mt-1 text-sm text-muted-foreground">Enable integrations for this organisation, configure the required keys and IDs, then grant each connected integration to individual agents for Chat and Voice.</p></div>
  <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"><div><p className="text-sm font-medium">Plan allowance</p><p className="mt-1 text-xs text-muted-foreground">{plan.id} · maximum {plan.maxIntegrations===-1?"unlimited":plan.maxIntegrations} enabled integrations</p></div><PlugZap className="h-5 w-5 text-primary"/></div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div>}
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(i=><div key={i.id} className="rounded-2xl border border-border bg-card p-5">
   <div className="flex gap-3"><img src={i.logoUrl} className="h-10 w-10 object-contain" alt=""/><div className="flex-1"><h2 className="font-semibold">{i.displayName}</h2><p className="text-xs text-muted-foreground">{i.category} · {i.authType}</p></div></div>
   <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{i.description}</p>
   <p className="mt-2 text-xs text-muted-foreground">{i.actions.length} supported actions</p>
   {!i.platformEnabled?<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5"/>Disabled by platform administrator</div>:
   !i.planAllowed?<div className="mt-4 text-xs text-amber-600">Not included in the {plan.id} plan.</div>:
   <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy===i.id} onClick={()=>void access(i,!i.organisationEnabled)} className={`rounded-lg px-3 py-2 text-xs font-medium ${i.organisationEnabled?"border border-border":"bg-primary text-primary-foreground"}`}>{busy===i.id?"Saving…":i.organisationEnabled?"Disable for organisation":"Enable for organisation"}</button>{i.organisationEnabled&&i.authType!=="none"&&<button disabled={busy===i.id} onClick={()=>i.authType==="oauth2"?void startOAuth(i):openConnect(i)} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">{busy===i.id?"Connecting…":i.authType==="oauth2"?(i.connected?"Reconnect account":"Connect account"):(i.connected?"Update credentials":"Configure / connect")}</button>}</div>}
   {i.connected&&<div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5"/>Credentials connected</div>}
   {i.organisationEnabled&&!i.connected&&i.authType!=="none"&&<p className="mt-3 text-xs text-amber-600">Set up credentials here, then enable this integration on each agent that should use it.</p>}
  </div>)}</div>
  {selected&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="integration-connection-title" className="my-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl">
   <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2"><KeyRound className="h-5 w-5 text-primary"/></div><div><h2 id="integration-connection-title" className="text-lg font-semibold">Configure {selected.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">Enter the credential values required by the provider. Secrets are encrypted server-side and are not shown again after saving.</p></div></div>
   {selected.authType==="oauth2"&&<div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm"><p className="font-medium">OAuth setup reference</p><p className="mt-1 text-xs text-muted-foreground">Register the callback URL with the provider if its OAuth app requires one. This form saves credentials for a connection; it does not start an interactive OAuth consent flow.</p><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">{callbackUrl}</code><button type="button" className="rounded-md border border-border p-1.5" aria-label="Copy callback URL" onClick={()=>void navigator.clipboard?.writeText(callbackUrl)}><Copy className="h-3.5 w-3.5"/></button></div>{selected.oauth2Config?.authUrl&&<a className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline" href={selected.oauth2Config.authUrl} target="_blank" rel="noreferrer">Provider authorization endpoint <ExternalLink className="h-3 w-3"/></a>}</div>}
   <div className="mt-5 grid gap-4 sm:grid-cols-2">{fields.map(field=><label key={field.name} className="block space-y-1.5"><span className="text-sm font-medium">{field.displayName}{field.required&&<span className="text-red-500"> *</span>}</span>{field.type==="dropdown"?<select value={values[field.name]??""} onChange={e=>setValues(v=>({...v,[field.name]:e.target.value}))} required={field.required} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><option value="">Select…</option>{field.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input type={field.type==="secret"?"password":"text"} autoComplete={field.type==="secret"?"new-password":"off"} value={values[field.name]??""} onChange={e=>setValues(v=>({...v,[field.name]:e.target.value}))} required={field.required} placeholder={field.type==="secret"?"Enter value securely":field.name} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/>}{field.description&&<span className="block text-xs text-muted-foreground">{field.description}</span>}</label>)}</div>
   {fields.length===0&&<p className="mt-4 text-sm text-muted-foreground">This integration does not require credentials.</p>}
   <div className="mt-6 flex flex-wrap justify-end gap-2"><button onClick={()=>{setSelected(null);setValues({});setError(null)}} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button onClick={()=>void connect()} disabled={busy===selected.id||fields.some(f=>f.required&&!values[f.name]?.trim())} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">{busy===selected.id?"Saving…":"Save encrypted credentials"}</button></div>
  </div></div>}
 </div>
}
