"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle, CheckCircle2, Copy, ExternalLink, KeyRound, Loader2,
  PlugZap, RefreshCw, ShieldCheck, X,
} from "lucide-react";

type CredentialField = {
  name: string;
  displayName: string;
  description?: string;
  type: "text" | "secret" | "dropdown";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
};
type Item = {
  id: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: string;
  authType: string;
  actions: string[];
  platformEnabled: boolean;
  planAllowed: boolean;
  organisationEnabled: boolean;
  agentEnabled: boolean;
  connected: boolean;
  connectionStatus?: "connected" | "expired" | "error" | "revoked" | "disconnected";
  connectionUpdatedAt?: string | null;
  customAuthFields?: CredentialField[];
  oauth2Config?: { authUrl: string; tokenUrl: string; scopes: string[] };
};

function credentialFields(item: Item): CredentialField[] {
  if (item.customAuthFields?.length) return item.customAuthFields;
  if (item.authType === "none") return [];
  if (item.authType === "secret_text") return [{ name: "api_key", displayName: "API key / access token", type: "secret", required: true }];
  if (item.authType === "basic_auth") return [
    { name: "username", displayName: "Username", type: "text", required: true },
    { name: "password", displayName: "Password", type: "secret", required: true },
  ];
  if (item.authType === "oauth2") return [
    { name: "client_id", displayName: "OAuth Client ID", type: "text", required: true, description: "Client ID from the integration provider's developer console." },
    { name: "client_secret", displayName: "OAuth Client Secret", type: "secret", required: true, description: "Saved encrypted; never returned to the browser." },
    { name: "access_token", displayName: "Access Token (optional)", type: "secret", required: false, description: "Use this only if your provider supplies a token directly and the integration supports token-based authentication." },
    { name: "refresh_token", displayName: "Refresh Token (optional)", type: "secret", required: false },
  ];
  return [
    { name: "api_key", displayName: "API key", type: "secret", required: true },
    { name: "base_url", displayName: "Base URL (optional)", type: "text", required: false },
  ];
}

export default function AgentIntegrationsScreen() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Credential dialog state — connecting happens directly on this screen.
  const [selected, setSelected] = useState<Item | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = useMemo(() => selected ? credentialFields(selected) : [], [selected]);
  const callbackUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/integrations/oauth/callback`
    : "/api/integrations/oauth/callback";

  const load = useCallback(async () => {
    if (!id || !agentId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/orgs/${id}/agents/${agentId}/integrations`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load agent integrations");
      setItems(d.integrations ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agent integrations");
    } finally { setLoading(false); }
  }, [id, agentId]);

  useEffect(() => {
    void load();
    // OAuth consent flows started from this screen return here with a result.
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    const integrationId = params.get("integrationId");
    if (oauth === "connected") setNotice(`OAuth connection completed for ${integrationId ?? "integration"}. You can now enable it for this agent.`);
    else if (oauth === "cancelled") setError("The provider authorization was cancelled.");
    else if (oauth === "error") setError("The OAuth connection could not be completed. Check the platform OAuth configuration and try again.");
    if (oauth) {
      params.delete("oauth"); params.delete("integrationId");
      const suffix = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (suffix ? `?${suffix}` : ""));
    }
  }, [load]);

  /** Enable the organisation-level grant (idempotent). Connecting implicitly
   *  enables it server-side, but explicit enables also cover credential-free
   *  integrations and re-enabling after an organisation-wide disable. */
  const enableForOrganisation = async (item: Item): Promise<boolean> => {
    const r = await fetch(`/api/orgs/${id}/integrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId: item.id, action: "enable" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? `Could not enable ${item.displayName} for the organisation`);
      return false;
    }
    return true;
  };

  const toggle = async (item: Item) => {
    setBusy(item.id); setError(null); setNotice(null);
    try {
      const next = !item.agentEnabled;
      // Enabling an agent grant requires the organisation grant; create it
      // implicitly so organisations never need a separate screen for this.
      if (next && !item.organisationEnabled) {
        const ok = await enableForOrganisation(item);
        if (!ok) return;
      }
      const r = await fetch(`/api/orgs/${id}/agents/${agentId}/integrations`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: item.id, enabled: next }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not update agent integration");
      await load();
      setNotice(`${item.displayName} ${next ? "enabled for" : "disabled for"} this agent.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update agent integration");
    } finally { setBusy(null); }
  };

  const startOAuth = async (item: Item) => {
    setBusy(item.id); setError(null); setNotice(null);
    try {
      // The OAuth start route requires the organisation grant to exist.
      if (!item.organisationEnabled) {
        const ok = await enableForOrganisation(item);
        if (!ok) { setBusy(null); return; }
      }
      const r = await fetch(`/api/orgs/${id}/integrations/${item.id}/oauth/start?agentId=${agentId}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok || typeof d.authorizationUrl !== "string") throw new Error(d.error ?? "Could not start OAuth connection");
      window.location.assign(d.authorizationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start OAuth connection");
      setBusy(null);
    }
  };

  const connect = async () => {
    if (!selected) return;
    const missing = fields.filter(f => f.required && !values[f.name]?.trim());
    if (missing.length) { setError(`Complete the required fields: ${missing.map(f => f.displayName).join(", ")}`); return; }
    const credentials = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    setBusy(selected.id); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/orgs/${id}/integrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: selected.id, action: "connect", credentials, displayName: selected.displayName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save integration credentials");
      const name = selected.displayName;
      setSelected(null); setValues({});
      await load();
      setNotice(`${name} connected. You can now enable it for this agent.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save integration credentials");
    } finally { setBusy(null); }
  };

  const disconnect = async (item: Item) => {
    if (!window.confirm(`Disconnect ${item.displayName}? Agents using these credentials will no longer be able to run its actions.`)) return;
    setBusy(item.id); setError(null); setNotice(null);
    try {
      // OAuth flows started from an agent screen create agent-scoped
      // connections; manual connects are organisation-wide. Clear both so the
      // card reliably reflects the disconnected state.
      const results = await Promise.allSettled([
        fetch(`/api/orgs/${id}/integrations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ integrationId: item.id, action: "disconnect" }),
          cache: "no-store",
        }),
        fetch(`/api/orgs/${id}/integrations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ integrationId: item.id, action: "disconnect", agentId }),
          cache: "no-store",
        }),
      ]);
      const failed = results.find(r => r.status === "fulfilled" && !r.value.ok);
      if (failed && failed.status === "fulfilled") {
        const d = await failed.value.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not disconnect integration");
      }
      await load();
      setNotice(`${item.displayName} disconnected.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect integration");
    } finally { setBusy(null); }
  };

  const enabledCount = items.filter(i => i.agentEnabled).length;

  const cardView = (item: Item) => {
    const available = item.platformEnabled && item.planAllowed;
    const needsCredentials = item.authType !== "none";
    const busyItem = busy === item.id;
    const canEnable = available && (item.connected || !needsCredentials);
    const toggleDisabled = busyItem || (!item.agentEnabled && !canEnable);
    const toggleTitle = !item.agentEnabled && !available
      ? "This integration is not available for your plan"
      : !item.agentEnabled && !item.connected && needsCredentials
        ? "Connect credentials first"
        : undefined;

    return (
      <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 items-start gap-3">
          <img src={item.logoUrl} className="h-10 w-10 shrink-0 object-contain" alt={`${item.displayName} logo`} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold" title={item.displayName}>{item.displayName}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.category} · {item.actions.length} action{item.actions.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={item.agentEnabled}
            aria-label={`${item.agentEnabled ? "Disable" : "Enable"} ${item.displayName} for this agent`}
            disabled={toggleDisabled}
            title={toggleTitle}
            onClick={() => void toggle(item)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              item.agentEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            {busyItem
              ? <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              : <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${item.agentEnabled ? "left-[1.4rem]" : "left-0.5"}`} />}
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>

        <div className="mt-4 flex-1">
          {!available ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-xs text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This integration is not available for your plan.
            </p>
          ) : item.connected ? (
            <div className="text-xs">
              <p className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Connected{item.connectionUpdatedAt ? ` · ${new Date(item.connectionUpdatedAt).toLocaleDateString()}` : ""}
              </p>
              {item.connectionStatus === "expired" && <p className="mt-1 text-amber-600">Connection expired — reconnect to restore agent access.</p>}
              {item.connectionStatus === "error" && <p className="mt-1 text-red-600">Connection needs attention — reconnect or update credentials.</p>}
              {item.connectionStatus === "revoked" && <p className="mt-1 text-muted-foreground">Connection was revoked.</p>}
            </div>
          ) : needsCredentials ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {item.connectionStatus === "expired"
                ? "Connection expired — reconnect below."
                : item.connectionStatus === "error"
                  ? "Connection error — reconnect below."
                  : item.connectionStatus === "revoked"
                    ? "Connection revoked — reconnect below."
                    : "Not connected — connect to enable it for agents."}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              No credentials required.
            </p>
          )}
        </div>

        {available && needsCredentials && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {!item.connected && (
              <button
                type="button"
                disabled={busyItem}
                onClick={() => item.authType === "oauth2" ? void startOAuth(item) : (setSelected(item), setValues({}))}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busyItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                {busyItem ? "Connecting…" : item.connectionStatus && item.connectionStatus !== "disconnected"
                  ? "Reconnect account"
                  : item.authType === "oauth2" ? "Connect account" : "Connect"}
              </button>
            )}
            {item.connected && (
              <button
                type="button"
                disabled={busyItem}
                onClick={() => item.authType === "oauth2" ? void startOAuth(item) : (setSelected(item), setValues({}))}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {item.authType === "oauth2" ? "Reconnect account" : "Update credentials"}
              </button>
            )}
            {item.connected && (
              <button
                type="button"
                disabled={busyItem}
                onClick={() => void disconnect(item)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Disconnect
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Agent integrations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Connect integrations with your organisation&apos;s credentials and choose which ones this agent may use
            during Chat, Voice Chat and Realtime Voice tool calls. Integrations not included in your plan stay read-only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />{enabledCount} of {items.length} enabled for agent
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            aria-label="Refresh integrations"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}
        </div>
      )}

      {loading && !items.length && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading integrations…
        </p>
      )}
      {!loading && !items.length && !error && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <PlugZap className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No integrations available yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Integrations appear here once the platform administrator enables them for your plan.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(cardView)}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="integration-connection-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-2xl overflow-y-auto [overflow-wrap:anywhere] rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2"><KeyRound className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <h2 id="integration-connection-title" className="text-lg font-semibold">Connect {selected.displayName}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Enter the credential values required by the provider. Secrets are encrypted server-side and are not shown again after saving.</p>
              </div>
            </div>

            {selected.authType === "oauth2" && (
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">OAuth setup reference</p>
                <p className="mt-1 text-xs text-muted-foreground">Register the callback URL with the provider if its OAuth app requires one. This form saves credentials for a connection; use &ldquo;Connect account&rdquo; on the card for the interactive OAuth consent flow.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-xs">{callbackUrl}</code>
                  <button type="button" className="rounded-md border border-border p-1.5" aria-label="Copy callback URL" onClick={() => void navigator.clipboard?.writeText(callbackUrl)}><Copy className="h-3.5 w-3.5" /></button>
                </div>
                {selected.oauth2Config?.authUrl && (
                  <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline" href={selected.oauth2Config.authUrl} target="_blank" rel="noreferrer">Provider authorization endpoint <ExternalLink className="h-3 w-3" /></a>
                )}
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {fields.map(field => (
                <label key={field.name} className="block space-y-1.5">
                  <span className="text-sm font-medium">{field.displayName}{field.required && <span className="text-red-500"> *</span>}</span>
                  {field.type === "dropdown" ? (
                    <select value={values[field.name] ?? ""} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))} required={field.required} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                      <option value="">Select…</option>
                      {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type === "secret" ? "password" : "text"}
                      autoComplete={field.type === "secret" ? "new-password" : "off"}
                      value={values[field.name] ?? ""}
                      onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                      required={field.required}
                      placeholder={field.type === "secret" ? "Enter value securely" : field.name}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                  {field.description && <span className="block text-xs text-muted-foreground">{field.description}</span>}
                </label>
              ))}
            </div>
            {fields.length === 0 && <p className="mt-4 text-sm text-muted-foreground">This integration does not require credentials.</p>}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button onClick={() => { setSelected(null); setValues({}); setError(null); }} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => void connect()} disabled={busy === selected.id || fields.some(f => f.required && !values[f.name]?.trim())} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                {busy === selected.id ? "Saving…" : "Save encrypted credentials"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
