"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, ShieldOff, KeyRound, Copy, X, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import { getOAuthSetupGuide } from "@/modules/integrations/oauth-setup-guides";

type OAuthApp = { integrationId:string; configured:boolean; credentialSource?:"database"|"unconfigured"; secretConfigured?:boolean; clientId:string; redirectUri:string; scopes:string[] };
type CredentialField = { name:string; displayName:string; description?:string; type:"text"|"secret"|"dropdown"; required:boolean };
type CredentialState = { integrationId:string; authType:string; configured:boolean; displayHint:string|null; updatedAt:string|null; fields:CredentialField[] };
type Integration = { id:string; displayName:string; description:string; logoUrl:string; category:string; authType:string; actions:string[]; platformEnabled:boolean; allowedPlans:string[]; configured:boolean; requiresOAuthApp?:boolean; oauth2Config?:{scopes?:string[];authUrl?:string} };
type StatusFilter = "all"|"enabled"|"configured"|"unconfigured";

const STATUS_TABS: Array<{id:StatusFilter;label:string}> = [
  { id:"all", label:"All" },
  { id:"enabled", label:"Enabled" },
  { id:"configured", label:"Ready to enable" },
  { id:"unconfigured", label:"Not configured" },
];

export default function PlatformIntegrationsScreen(){
 const [items,setItems]=useState<Integration[]>([]); const [q,setQ]=useState(""); const [busy,setBusy]=useState<string|null>(null);
 const [status,setStatus]=useState<StatusFilter>("all"); const [category,setCategory]=useState("all");
 const [selected,setSelected]=useState<Integration|null>(null); const [oauth,setOauth]=useState<OAuthApp|null>(null);
 const [credential,setCredential]=useState<CredentialState|null>(null); const [credValues,setCredValues]=useState<Record<string,string>>({}); const [credHint,setCredHint]=useState("");
 const [clientId,setClientId]=useState(""); const [clientSecret,setClientSecret]=useState(""); const [redirectUri,setRedirectUri]=useState(""); const [scopes,setScopes]=useState("");
 const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
 const load=()=>fetch("/api/platform/integrations",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load integrations");setItems(d.integrations??[])});
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);

 const categories=useMemo(()=>{const c=new Map<string,number>();for(const i of items)c.set(i.category,(c.get(i.category)??0)+1);return [...c.entries()].sort((a,b)=>b[1]-a[1])},[items]);
 const stats=useMemo(()=>({total:items.length,enabled:items.filter(i=>i.platformEnabled).length,configured:items.filter(i=>i.configured).length}),[items]);
 const filtered=useMemo(()=>items.filter(i=>{
  if(status==="enabled"&&!i.platformEnabled)return false;
  if(status==="configured"&&!(i.configured&&!i.platformEnabled))return false;
  if(status==="unconfigured"&&i.configured)return false;
  if(category!=="all"&&i.category!==category)return false;
  const needle=q.toLowerCase();
  return [i.displayName,i.description,i.category].some(v=>v.toLowerCase().includes(needle));
 }),[items,q,status,category]);

 function openConfigure(i:Integration){ setError(null);setNotice(null); i.authType==="oauth2" ? void openOAuth(i) : void openCredentials(i); }

 async function toggle(i:Integration){setBusy(i.id);setError(null);setNotice(null);try{const r=await fetch("/api/platform/integrations",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({integrationId:i.id,enabled:!i.platformEnabled})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not update integration");await load();setNotice(`${i.displayName} ${!i.platformEnabled?"enabled":"disabled"}.`)}catch(e){setError(e instanceof Error?e.message:"Could not update integration")}finally{setBusy(null)}}
 async function openOAuth(i:Integration){
  setBusy(i.id);setError(null);setNotice(null);
  try{const r=await fetch(`/api/platform/integrations/${encodeURIComponent(i.id)}/oauth-app`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load OAuth configuration");setSelected(i);setOauth(d);setCredential(null);setClientId(d.clientId??"");setClientSecret("");setRedirectUri(`${window.location.origin}/api/integrations/oauth/callback`);setScopes((d.scopes??i.oauth2Config?.scopes??[]).join("\n"))}
  catch(e){setError(e instanceof Error?e.message:"Could not load OAuth configuration")}finally{setBusy(null)}
 }
 async function openCredentials(i:Integration){
  setBusy(i.id);setError(null);setNotice(null);
  try{const r=await fetch(`/api/platform/integrations/${encodeURIComponent(i.id)}/credentials`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load integration configuration");setSelected(i);setCredential(d);setOauth(null);setCredValues({});setCredHint(d.displayHint??"")}
  catch(e){setError(e instanceof Error?e.message:"Could not load integration configuration")}finally{setBusy(null)}
 }
 async function saveCredentials(){
  if(!selected||!credential)return;
  const missing=credential.fields.filter(f=>f.required&&!credValues[f.name]?.trim());
  if(missing.length){setError(`Complete the required fields: ${missing.map(f=>f.displayName).join(", ")}`);return}
  const credentials=Object.fromEntries(Object.entries(credValues).filter(([,v])=>v.trim()).map(([k,v])=>[k,v.trim()]));
  setBusy(selected.id);setError(null);setNotice(null);
  try{const r=await fetch(`/api/platform/integrations/${encodeURIComponent(selected.id)}/credentials`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({credentials,displayHint:credHint.trim()||undefined})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not save integration credentials");
  const name=selected.displayName;closeDialogs();await load();setNotice(`${name} configured. You can now enable it for organisations.`)}
  catch(e){setError(e instanceof Error?e.message:"Could not save integration credentials")}finally{setBusy(null)}
 }
 async function removeCredentials(){
  if(!selected)return;
  if(!window.confirm(`Remove the stored ${selected.displayName} credentials? The integration will be disabled until it is configured again.`))return;
  setBusy(selected.id);setError(null);setNotice(null);
  try{const r=await fetch(`/api/platform/integrations/${encodeURIComponent(selected.id)}/credentials`,{method:"DELETE"});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not remove integration credentials");
  const name=selected.displayName;closeDialogs();await load();setNotice(`${name} credentials removed and the integration disabled.`)}
  catch(e){setError(e instanceof Error?e.message:"Could not remove integration credentials")}finally{setBusy(null)}
 }
 async function saveOAuth(){
  if(!selected)return;setBusy(selected.id);setError(null);setNotice(null);
  try{const r=await fetch(`/api/platform/integrations/${encodeURIComponent(selected.id)}/oauth-app`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({clientId,clientSecret,redirectUri,scopes:scopes.split(/\n|,/).map(s=>s.trim()).filter(Boolean)})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not save OAuth configuration");setOauth(v=>v?{...v,configured:true,credentialSource:"database",secretConfigured:true,clientId,redirectUri,scopes:scopes.split(/\n|,/).map(s=>s.trim()).filter(Boolean)}:v);setClientSecret("");setNotice(`${selected.displayName} OAuth application settings saved. The client secret is not returned to the browser.`);await load()}
  catch(e){setError(e instanceof Error?e.message:"Could not save OAuth configuration")}finally{setBusy(null)}
 }
 function closeDialogs(){setSelected(null);setOauth(null);setCredential(null);setClientId("");setClientSecret("");setRedirectUri("");setScopes("");setCredValues({});setCredHint("");setError(null)}

 const dialogOpen=Boolean(selected&&(oauth||credential));

 return <div className="min-w-0 space-y-6">
  <div className="min-w-0">
   <h1 className="text-xl sm:text-2xl font-semibold">Integrations</h1>
   <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Integrations start disabled. Configure an integration, then enable it for organisations.</p>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div>}

  {/* Filters: status tabs + category + search */}
  <div className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
   <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
    <div className="relative min-w-0 flex-1">
     <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
     <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search integrations…" aria-label="Search integrations" className="w-full min-w-0 rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"/>
    </div>
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
     <span className="whitespace-nowrap">Category</span>
     <select value={category} onChange={e=>setCategory(e.target.value)} aria-label="Filter by category" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
      <option value="all">All categories ({stats.total})</option>
      {categories.map(([c,n])=><option key={c} value={c}>{c.replace(/_/g," ")} ({n})</option>)}
     </select>
    </label>
   </div>
   <div className="flex min-w-0 flex-wrap items-center gap-2" role="tablist" aria-label="Filter by status">
    {STATUS_TABS.map(t=>{
     const active=status===t.id;
     const count=t.id==="all"?stats.total:t.id==="enabled"?stats.enabled:t.id==="configured"?stats.configured-stats.enabled:stats.total-stats.configured;
     return <button key={t.id} role="tab" aria-selected={active} onClick={()=>setStatus(t.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active?"bg-primary text-primary-foreground":"border border-border bg-background text-muted-foreground hover:text-foreground"}`}>{t.label} <span className={active?"opacity-80":"text-muted-foreground/70"}>({Math.max(count,0)})</span></button>;
    })}
   </div>
  </div>

  {/* Card grid */}
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
   {filtered.map(i=>{
    const badge=i.platformEnabled
     ?{label:"Enabled",cls:"bg-emerald-500/10 text-emerald-600 border-emerald-500/20",icon:CheckCircle2}
     :i.configured
      ?{label:"Ready to enable",cls:"bg-sky-500/10 text-sky-700 border-sky-500/20",icon:ShieldCheck}
      :{label:"Not configured",cls:"bg-amber-500/10 text-amber-700 border-amber-500/25",icon:AlertCircle};
    const BadgeIcon=badge.icon;
    return <div key={i.id} className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
     <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/60"><img src={i.logoUrl} alt="" loading="lazy" className="h-7 w-7 object-contain"/></div>
      <div className="min-w-0 flex-1">
       <h2 className="truncate font-semibold" title={i.displayName}>{i.displayName}</h2>
       <p className="mt-0.5 truncate text-xs text-muted-foreground">{i.category.replace(/_/g," ")} · {i.authType.replace(/_/g," ")}</p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${badge.cls}`}><BadgeIcon className="h-3 w-3" aria-hidden="true"/><span className="hidden sm:inline">{badge.label}</span></span>
     </div>
     <p className="mt-3 min-h-10 line-clamp-2 text-sm text-muted-foreground">{i.description}</p>
     <p className="mt-2 text-xs text-muted-foreground/80">{i.actions.length} supported actions</p>
     <div className="mt-auto flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      {i.configured ? <button onClick={()=>void toggle(i)} disabled={busy===i.id} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${i.platformEnabled?"border border-border hover:bg-muted":"bg-primary text-primary-foreground hover:bg-primary/90"} disabled:opacity-50`}>
       {i.platformEnabled?<><ShieldOff className="h-3.5 w-3.5"/>Disable</>:<><ShieldCheck className="h-3.5 w-3.5"/>Enable</>}
      </button> :
      <button onClick={()=>openConfigure(i)} disabled={busy===i.id} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
       <Settings2 className="h-3.5 w-3.5"/>{busy===i.id?"Loading…":i.authType==="oauth2"?"Set up OAuth":"Configure"}
      </button>}
      {i.configured&&<button onClick={()=>openConfigure(i)} disabled={busy===i.id} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">
       <KeyRound className="h-3.5 w-3.5"/>{i.authType==="oauth2"?"OAuth settings":"Credentials"}
      </button>}
     </div>
    </div>;
   })}
  </div>
  {!filtered.length&&<div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No integrations match your filters.</div>}

  {/* OAuth dialog */}
  {selected&&oauth&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="oauth-title" className="my-auto box-border max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-xl overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere] rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
   <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 id="oauth-title" className="min-w-0 break-words text-lg font-semibold">{selected.displayName} OAuth app</h2><p className="mt-1 text-sm text-muted-foreground">Save provider application settings for platform-managed OAuth configuration.</p></div><button onClick={closeDialogs} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4"/></button></div>
   <div className="mt-4 min-w-0 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-foreground break-words"><p className="font-medium">How to configure this provider</p>{getOAuthSetupGuide(selected.id)&&<p className="mt-2 text-xs"><a href={getOAuthSetupGuide(selected.id)!.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">Open {getOAuthSetupGuide(selected.id)!.label} <span aria-hidden="true">↗</span></a></p>}<p className="mt-2 text-xs text-muted-foreground">{getOAuthSetupGuide(selected.id)?.note??"Open the provider’s official developer console and select the OAuth application for this integration (not Clara sign-in). Find its redirect/callback URL and API permissions settings."}</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground"><li>Copy the exact callback URI below into the provider’s authorised redirect/callback URI list, then save the provider app.</li><li>Use the scopes shown below. Enable the corresponding APIs and consent-screen permissions where required.</li><li>Save the client ID and secret here. Then connect from the organisation Integrations page to complete consent.</li></ol><p className="mt-2 text-xs text-muted-foreground">Clara handles consent, one-time state validation and server-side token exchange through the shared OAuth callback. Saving credentials alone does not connect an account.</p></div>
   <div className="mt-4 space-y-4">
    <label className="block space-y-1.5"><span className="text-sm font-medium">OAuth Client ID *</span><input value={clientId} onChange={e=>setClientId(e.target.value)} autoComplete="off" className="block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" placeholder="Client ID from provider developer console"/></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">OAuth Client Secret {oauth.configured?"(leave blank to keep current secret)":"*"}</span><input type="password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} autoComplete="new-password" className="block w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" placeholder={oauth.configured?"Saved securely · blank keeps existing secret":"Enter client secret"}/></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Redirect / callback URI *</span><div className="flex min-w-0 gap-2"><input value={redirectUri} className="block w-full min-w-0 max-w-full flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm" readOnly aria-readonly="true"/><button type="button" aria-label="Copy redirect URI" className="rounded-lg border border-border px-3" onClick={()=>void navigator.clipboard?.writeText(redirectUri)}><Copy className="h-4 w-4"/></button></div><span className="text-xs text-muted-foreground">Generated from this Clara deployment and shared OAuth callback route. Register this exact value with the provider; do not add a trailing slash or query string.</span></label>
    <label className="block space-y-1.5"><span className="text-sm font-medium">Scopes (one per line)</span><textarea value={scopes} onChange={e=>setScopes(e.target.value)} rows={4} className="block w-full min-w-0 max-w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm" placeholder="read:profile&#10;write:messages"/><span className="text-xs text-muted-foreground">{scopes.trim()?"Review these exact scopes against the provider console before saving. Clara requests the configured scopes during consent.":"No default scopes are defined for this integration. Configure permissions in the provider console and confirm the provider accepts an empty scope list before connecting."}</span></label>
   </div>
   <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"><p><span className="font-medium text-foreground">Credential source:</span> {oauth.credentialSource==="database"?"Encrypted platform database":"Not configured"}</p><p className="mt-1"><span className="font-medium text-foreground">Client secret:</span> {oauth.secretConfigured?"Stored; secret value is never returned to the browser":"Not configured"}</p><p className="mt-1">Clara currently reads platform-managed OAuth credentials from its encrypted database. Environment-variable fallback is not enabled, so the UI will not imply an environment credential is available.</p></div>
   <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{oauth.configured?"OAuth app configured":"First-time setup"}</span><div className="flex min-w-0 flex-wrap gap-2"><button onClick={closeDialogs} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button onClick={()=>void saveOAuth()} disabled={busy===selected.id||!clientId.trim()||!redirectUri.trim()||(!oauth.configured&&!clientSecret)} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy===selected.id?"Saving…":"Save OAuth settings"}</button></div></div>
  </div></div>}

  {/* Credentials dialog (secret_text / basic_auth / custom_auth) */}
  {selected&&credential&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="credentials-title" className="my-auto box-border max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-xl overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
   <div className="flex min-w-0 items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
     <div className="shrink-0 rounded-xl bg-primary/10 p-2"><Settings2 className="h-5 w-5 text-primary"/></div>
     <div className="min-w-0"><h2 id="credentials-title" className="text-lg font-semibold">Configure {selected.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">Save the platform-managed credentials organisations will use to connect this integration. Values are encrypted server-side and never shown again.</p></div>
    </div>
    <button onClick={closeDialogs} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4"/></button>
   </div>
   {credential.configured&&<div className="mt-4 flex min-w-0 items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><div className="min-w-0"><p className="font-medium">Credentials configured{credential.updatedAt?` · updated ${new Date(credential.updatedAt).toLocaleString()}`:""}.</p><p className="mt-0.5">Saving again replaces the stored values. Removing them disables the integration.</p></div></div>}
   <div className="mt-4 grid gap-4 sm:grid-cols-2">{credential.fields.map(field=><label key={field.name} className="block space-y-1.5">
    <span className="text-sm font-medium">{field.displayName}{field.required&&<span className="text-red-500"> *</span>}</span>
    <input type={field.type==="secret"?"password":"text"} autoComplete={field.type==="secret"?"new-password":"off"} value={credValues[field.name]??""} onChange={e=>setCredValues(v=>({...v,[field.name]:e.target.value}))} placeholder={field.type==="secret"?"Enter value securely":field.name} className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/>
    {field.description&&<span className="block text-xs text-muted-foreground">{field.description}</span>}
   </label>)}
   <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">Display hint (optional)</span><input value={credHint} onChange={e=>setCredHint(e.target.value)} maxLength={200} placeholder="e.g. Shared platform API key — read-only access" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Shown to organisation admins instead of the secret values.</span></label>
   </div>
   <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
    {credential.configured
     ?<button onClick={()=>void removeCredentials()} disabled={busy===selected.id} className="min-h-10 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50">Remove credentials</button>
     :<span className="text-xs text-muted-foreground">First-time setup</span>}
    <div className="flex min-w-0 flex-wrap gap-2">
     <button onClick={closeDialogs} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
     <button onClick={()=>void saveCredentials()} disabled={busy===selected.id||credential.fields.some(f=>f.required&&!credValues[f.name]?.trim())} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy===selected.id?"Saving…":"Save encrypted credentials"}</button>
    </div>
   </div>
  </div></div>}
 </div>
}
