"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle, Cable, CheckCircle2, ChevronDown, ChevronRight, CircleSlash,
  Globe, KeyRound, Loader2, PlugZap, RefreshCw, Wrench, X, Zap,
} from "lucide-react";

type McpTool = { name: string; approved: boolean; allowedSurfaces: string[]; organisationEnabled: boolean; agentEnabled: boolean };
type McpServer = {
  id: string; serverKey: string; displayName: string; description: string;
  endpointUrl: string; authMode: "none" | "bearer" | "oauth"; platformEnabled: boolean;
  hasPlatformCredential: boolean; oauthStatus: string;
  planAllowed: boolean; allowedPlans: string[]; connectionStatus: string | null;
  lastConnectedAt: string | null; lastErrorCode: string | null; tools: McpTool[];
};
type ProbeResult = {
  ok: boolean; durationMs: number;
  serverInfo?: { name: string | null; version: string | null; protocolVersion: string | null } | null;
  toolCount?: number; tools?: Array<{ name: string; description: string | null }>;
  error?: string; errorCode?: string;
};

function connectionMeta(s: McpServer) {
  switch (s.connectionStatus) {
    case "connected": return { label: "Connected", dot: "bg-emerald-500", chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
    case "configured": return { label: "Credentials saved", dot: "bg-amber-500", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700", icon: KeyRound };
    case "error": return { label: `Error: ${s.lastErrorCode ?? "unknown"}`, dot: "bg-red-500", chip: "border-red-500/25 bg-red-500/10 text-red-600", icon: AlertCircle };
    default: return { label: "Not connected", dot: "bg-muted-foreground/40", chip: "border-border bg-muted text-muted-foreground", icon: CircleSlash };
  }
}

function authChip(s: McpServer) {
  if (s.authMode === "oauth") return <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Platform OAuth</span>;
  if (s.authMode === "bearer") return <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s.hasPlatformCredential ? "Platform key" : "Own token"}</span>;
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">No auth</span>;
}

export default function OrgMcpServersPanel() {
  const { id = "" } = useParams<{ id: string }>();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);

  // Connect dialog state
  const [connectTarget, setConnectTarget] = useState<McpServer | null>(null);
  const [token, setToken] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Test results keyed by server id
  const [testResults, setTestResults] = useState<Record<string, ProbeResult | null>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load MCP servers");
      setServers(d.servers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load MCP servers");
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (s: McpServer, body: Record<string, unknown>, successMessage: string) => {
    setBusy(s.id); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: s.id, ...body }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not update MCP configuration");
      await load();
      setNotice(successMessage);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update MCP configuration");
      return null;
    } finally { setBusy(null); }
  };

  /** Live handshake with the organisation's stored credentials. */
  const testConnection = async (s: McpServer) => {
    setBusy(`test:${s.id}`); setTestResults(v => ({ ...v, [s.id]: null }));
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: s.id, action: "test" }) });
      const d = await r.json();
      const result: ProbeResult = d.probe ?? { ok: false, durationMs: 0, error: d.error ?? "Test failed" };
      setTestResults(v => ({ ...v, [s.id]: result }));
      await load();
      if (result.ok) setNotice(`${s.displayName}: handshake succeeded — ${result.toolCount} tools available.`);
      else setError(`${s.displayName}: ${result.error ?? "handshake failed"}`);
    } catch (e) {
      setTestResults(v => ({ ...v, [s.id]: { ok: false, durationMs: 0, error: e instanceof Error ? e.message : "Test failed" } }));
    } finally { setBusy(null); }
  };

  const saveConnection = async () => {
    if (!connectTarget) return;
    const needsOwnToken = connectTarget.authMode === "bearer" && !connectTarget.hasPlatformCredential;
    if (needsOwnToken && token.trim().length < 8) { setDialogError("Enter the API key / bearer token for this MCP server."); return; }
    setBusy(connectTarget.id); setDialogError(null);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId: connectTarget.id, action: "connect", ...(connectTarget.authMode === "bearer" && token.trim() ? { credentials: { bearerToken: token.trim() } } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save the connection");
      const target = connectTarget;
      setConnectTarget(null); setToken("");
      await load();
      setNotice(target.authMode === "oauth"
        ? `${target.displayName} connected — it uses the platform's OAuth sign-in. Run a connection test to verify the handshake.`
        : `${target.displayName} credentials saved encrypted. Run a connection test to verify the handshake.`);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Could not save the connection");
    } finally { setBusy(null); }
  };

  const connectedCount = servers.filter(s => s.connectionStatus === "connected").length;

  return <section className="space-y-4">
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">MCP servers</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect platform-approved Model Context Protocol servers with this organisation's credentials, test the live handshake, then grant approved tools to agents.</p>
      </div>
      <div className="flex items-center gap-2">
        {servers.length > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{connectedCount} of {servers.length} connected</span>}
        <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50" aria-label="Refresh MCP servers" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>
        </button>
      </div>
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>{notice}</div>}

    {loading && !servers.length && <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading MCP servers…</p>}
    {!loading && !servers.length && !error && <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Cable className="h-5 w-5 text-muted-foreground"/></div>
      <p className="mt-3 text-sm font-medium">No MCP servers available yet</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Platform administration has not enabled any MCP servers for this organisation's plan. Available servers appear here once enabled.</p>
    </div>}

    <div className="space-y-3">
      {servers.map(s => {
        const meta = connectionMeta(s);
        const expanded = expandedId === s.id;
        const test = testResults[s.id] ?? null;
        const approvedTools = s.tools.filter(t => t.approved);
        return <div key={s.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <button onClick={() => setExpandedId(expanded ? null : s.id)} className="flex min-w-0 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30" aria-expanded={expanded}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><Globe className="h-5 w-5 text-primary"/></div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold" title={s.displayName}>{s.displayName}</h3>
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label}/>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}><meta.icon className="h-2.5 w-2.5"/>{meta.label}</span>
                {authChip(s)}
                {approvedTools.length > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"><Wrench className="h-2.5 w-2.5"/>{approvedTools.filter(t => t.organisationEnabled).length}/{approvedTools.length} granted</span>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.endpointUrl}</p>
              {s.connectionStatus === "connected" && s.lastConnectedAt && <p className="mt-0.5 text-[11px] text-muted-foreground/80">Last handshake {new Date(s.lastConnectedAt).toLocaleString()}</p>}
            </div>
            <div className="shrink-0 pt-1 text-muted-foreground">{expanded ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}</div>
          </button>

          {expanded && <div className="border-t border-border">
            {s.description && <div className="border-b border-border px-4 py-3"><p className="text-xs text-muted-foreground">{s.description}</p></div>}
            {!s.platformEnabled && <div className="border-b border-border bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700"><AlertCircle className="mr-1.5 inline h-3.5 w-3.5"/>Disabled by platform administration. You can still remove stored credentials and revoke grants.</div>}
            {!s.planAllowed && <div className="border-b border-border bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700"><AlertCircle className="mr-1.5 inline h-3.5 w-3.5"/>This server is not included in the organisation's current plan.</div>}

            {/* Test result */}
            {test && <div className={`flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs ${test.ok ? "bg-emerald-500/5 text-emerald-700" : "bg-red-500/5 text-red-600"}`}>
              {test.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0"/> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>}
              <div className="min-w-0">
                <p className="font-medium">{test.ok ? `Handshake succeeded in ${test.durationMs} ms${test.serverInfo?.name ? ` — ${test.serverInfo.name}` : ""} (protocol ${test.serverInfo?.protocolVersion ?? "?"})` : "Handshake failed"}</p>
                <p className="mt-0.5 break-words">{test.ok ? `${test.toolCount} tools available from the server: ${(test.tools ?? []).map(t => t.name).slice(0, 12).join(", ")}${(test.toolCount ?? 0) > 12 ? "…" : ""}` : test.error}</p>
              </div>
            </div>}

            {/* Actions */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button onClick={() => { setConnectTarget(s); setToken(""); setDialogError(null); }} disabled={busy===s.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                  <KeyRound className="h-3.5 w-3.5"/>{s.connectionStatus ? "Update credentials" : "Connect"}
                </button>
                {["configured", "connected", "error"].includes(s.connectionStatus ?? "") && <button onClick={() => void testConnection(s)} disabled={busy===`test:${s.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40" title="Run a live initialize + tools/list handshake with the stored credentials">
                  {busy===`test:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Zap className="h-3.5 w-3.5"/>}Test connection
                </button>}
              </div>
              {["configured", "connected", "error"].includes(s.connectionStatus ?? "") && (confirmDisconnectId === s.id
                ? <button onClick={() => { void act(s, { action: "disconnect" }, `${s.displayName} disconnected and grants revoked.`); setConfirmDisconnectId(null); }} onBlur={() => setConfirmDisconnectId(null)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"><AlertCircle className="h-3.5 w-3.5"/>Confirm disconnect</button>
                : <button onClick={() => setConfirmDisconnectId(s.id)} disabled={busy===s.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"><PlugZap className="h-3.5 w-3.5"/>Disconnect</button>)}
            </div>

            {/* Tool grants */}
            <div className="px-4 py-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Wrench className="h-3.5 w-3.5"/>Approved tools ({approvedTools.length})</h4>
              <div className="grid gap-1.5">
                {approvedTools.map(t => <div key={t.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <div className="min-w-0"><p className="truncate font-mono text-xs font-medium" title={t.name}>{t.name}</p><p className="text-[11px] text-muted-foreground">{t.allowedSurfaces.join(", ")}</p></div>
                  <button disabled={busy===s.id || (!t.organisationEnabled && (!s.platformEnabled || !["configured", "connected"].includes(s.connectionStatus ?? "")))} onClick={() => void act(s, { action: "grant-tool", toolName: t.name, enabled: !t.organisationEnabled }, `${t.name} ${t.organisationEnabled ? "revoked" : "granted"} for the organisation.`)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${t.organisationEnabled ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>{t.organisationEnabled ? "Revoke" : "Grant"}</button>
                </div>)}
                {!approvedTools.length && <p className="text-xs text-muted-foreground">No tools have been approved by platform administration yet.</p>}
              </div>
            </div>
          </div>}
        </div>;
      })}
    </div>

    {/* Connect dialog */}
    {connectTarget && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="mcp-connect-title" className="my-auto box-border max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2"><KeyRound className="h-5 w-5 text-primary"/></div>
          <div className="min-w-0"><h2 id="mcp-connect-title" className="text-lg font-semibold">Connect {connectTarget.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">
            {connectTarget.authMode === "oauth"
              ? "This server is authorized through the platform's OAuth sign-in — no credentials are needed here."
              : connectTarget.authMode === "bearer" && connectTarget.hasPlatformCredential
                ? "You can use the platform's stored key, or supply this organisation's own token. Either way it is encrypted server-side."
                : connectTarget.authMode === "bearer"
                  ? "Save the credentials this organisation will use for MCP calls. They are encrypted server-side and never shown again."
                  : "This server needs no credentials — confirm the connection to continue."}
          </p></div>
        </div>
        <button onClick={() => { setConnectTarget(null); setToken(""); setDialogError(null); }} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4"/></button>
      </div>
      {dialogError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{dialogError}</div>}
      {connectTarget.authMode === "oauth" && connectTarget.oauthStatus !== "connected" && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>The platform administrator has not completed the OAuth sign-in for this server yet — the connection cannot be used until they do.</div>}
      {connectTarget.authMode === "bearer" && <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium">API key / bearer token{connectTarget.hasPlatformCredential ? " (optional)" : " *"}</span>
        <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="new-password" placeholder={connectTarget.hasPlatformCredential ? "Leave blank to use the platform's stored key" : "API key or token issued by this MCP server"} className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/>
        <span className="text-xs text-muted-foreground">Create the key in the MCP server's own settings. Saving only stores the encrypted value — run Test connection afterwards to verify the handshake.</span>
      </label>}
      <div className="mt-6 flex min-w-0 flex-wrap items-center justify-end gap-2">
        <button onClick={() => { setConnectTarget(null); setToken(""); setDialogError(null); }} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
        <button onClick={() => void saveConnection()} disabled={busy===connectTarget.id} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy===connectTarget.id ? "Saving…" : "Save encrypted connection"}</button>
      </div>
    </div></div>}
  </section>;
}
