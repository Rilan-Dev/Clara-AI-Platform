"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Cable, CheckCircle2, ChevronDown, ChevronRight, CircleSlash,
  Globe, KeyRound, Loader2, LogIn, LogOut, Pencil, Plus, RefreshCw, ShieldCheck,
  ShieldOff, Trash2, Wrench, X, Zap,
} from "lucide-react";

type McpTool = { name: string; approved: boolean; allowedSurfaces: string[] };
type AuthMode = "none" | "bearer" | "oauth";
type McpServer = {
  id: string; serverKey: string; displayName: string; description: string;
  endpointUrl: string; authMode: AuthMode; platformEnabled: boolean;
  hasPlatformCredential: boolean; oauthStatus: string; oauthError: string | null;
  oauthConnectedAt: string | null;
  allowedPlans: string[]; createdAt: string; updatedAt: string; tools: McpTool[];
};
type ProbeTool = { name: string; description: string | null };
type ProbeResult = {
  ok: boolean; endpoint?: string; durationMs: number;
  serverInfo?: { name: string | null; version: string | null; protocolVersion: string | null } | null;
  tools?: ProbeTool[]; toolCount?: number; error?: string; errorCode?: string;
};
type ServerForm = {
  serverKey: string; displayName: string; endpointUrl: string; description: string;
  authMode: AuthMode; plans: string; bearerToken: string;
  scopes: string; useManualClient: boolean; manualClientId: string; manualClientSecret: string;
};

const EMPTY_FORM: ServerForm = {
  serverKey: "", displayName: "", endpointUrl: "", description: "", authMode: "bearer",
  plans: "pro,enterprise", bearerToken: "", scopes: "", useManualClient: false,
  manualClientId: "", manualClientSecret: "",
};

const AUTH_MODE_OPTIONS: Array<{ value: AuthMode; label: string; hint: string }> = [
  { value: "none", label: "No authentication", hint: "Public endpoints that accept unauthenticated requests." },
  { value: "bearer", label: "Bearer token / API key", hint: "The server expects an Authorization: Bearer header. Works with n8n, Make, Zapier and any API-key based MCP server." },
  { value: "oauth", label: "OAuth 2.0 sign-in", hint: "The server delegates authorization to an OAuth provider (Notion, Linear, GitHub, Google or any spec-compliant MCP authorization server). You sign in once; the platform stores and refreshes tokens." },
];

function statusMeta(server: McpServer) {
  if (!server.platformEnabled) return { label: "Disabled", dot: "bg-muted-foreground/40", chip: "border-border bg-muted text-muted-foreground", icon: CircleSlash };
  if (server.tools.some(t => t.approved)) return { label: "Enabled", dot: "bg-emerald-500", chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
  return { label: "Needs tool approval", dot: "bg-amber-500", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700", icon: AlertCircle };
}

function authMeta(server: McpServer) {
  if (server.authMode === "oauth") {
    if (server.oauthStatus === "connected") return { label: "OAuth connected", chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
    if (server.oauthStatus === "error") return { label: "OAuth error", chip: "border-red-500/25 bg-red-500/10 text-red-600", icon: AlertCircle };
    return { label: "Sign-in needed", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700", icon: LogIn };
  }
  if (server.authMode === "bearer") {
    return { label: server.hasPlatformCredential ? "Platform key stored" : "Org tokens", chip: "border-border bg-muted text-muted-foreground", icon: KeyRound };
  }
  return { label: "No auth", chip: "border-border bg-muted text-muted-foreground", icon: Globe };
}

export default function McpServersScreen() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmOauthDisconnectId, setConfirmOauthDisconnectId] = useState<string | null>(null);

  // Register / edit dialog state
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Discovery state (register dialog) and per-server test state
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({});
  const [testToken, setTestToken] = useState("");
  const [testResult, setTestResult] = useState<Record<string, ProbeResult | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/platform/mcp-servers", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load MCP servers");
      setServers(d.servers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load MCP servers");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // OAuth callback banner: the callback route redirects back to this page with
  // ?mcp_oauth=connected|cancelled|error — surface it, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("mcp_oauth");
    if (!status) return;
    const server = params.get("server") ?? "";
    const reason = params.get("reason") ?? "";
    if (status === "connected") setNotice(`OAuth sign-in completed${server ? ` for “${server}”` : ""}. Run a connection test to verify the handshake and import tools.`);
    else if (status === "cancelled") setNotice("OAuth sign-in was cancelled — the server stays unconnected.");
    else setError(`OAuth sign-in failed${reason ? ` (${reason})` : ""}. Check the server's authorization configuration and try again.`);
    params.delete("mcp_oauth"); params.delete("reason"); params.delete("server");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, []);

  const openRegister = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null);
    setProbe(null); setSelectedTools({});
    setShowRegister(true);
  };
  const openEdit = (s: McpServer) => {
    setEditing(s);
    setForm({
      serverKey: s.serverKey, displayName: s.displayName, endpointUrl: s.endpointUrl,
      description: s.description ?? "", authMode: s.authMode, plans: s.allowedPlans.join(","),
      bearerToken: "", scopes: "", useManualClient: false, manualClientId: "", manualClientSecret: "",
    });
    setFormError(null); setProbe(null); setSelectedTools({});
    setShowRegister(true);
  };
  const closeDialog = () => { setShowRegister(false); setEditing(null); setFormError(null); setProbe(null); setSelectedTools({}); };

  /** Live handshake against the endpoint in the form (discovery before save). */
  const runDiscovery = async () => {
    if (!form.endpointUrl.trim()) { setFormError("Enter the HTTPS endpoint first."); return; }
    setProbing(true); setFormError(null); setProbe(null);
    try {
      // In edit mode the serverId lets the backend fall back to the stored
      // platform credential when no token is typed (blank = keep current).
      const r = await fetch("/api/platform/mcp-servers/test", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { serverId: editing.id } : {}),
          endpointUrl: form.endpointUrl.trim(),
          ...(form.authMode === "bearer" && form.bearerToken.trim() ? { bearerToken: form.bearerToken.trim() } : {}),
        }),
      });
      const d = await r.json();
      const result: ProbeResult = d.probe ?? { ok: false, durationMs: 0, error: d.error ?? "Probe failed" };
      setProbe(result);
      if (result.ok) {
        setSelectedTools(Object.fromEntries((result.tools ?? []).map(t => [t.name, true])));
        if (!form.displayName.trim() && result.serverInfo?.name) setForm(f => ({ ...f, displayName: result.serverInfo!.name!.slice(0, 120) }));
      }
    } catch (e) {
      setProbe({ ok: false, durationMs: 0, error: e instanceof Error ? e.message : "Probe failed" });
    } finally { setProbing(false); }
  };

  /** Begin the OAuth sign-in: backend returns the provider's authorization URL. */
  const startOAuth = async (serverId: string, opts?: { scopes?: string; clientId?: string; clientSecret?: string }): Promise<boolean> => {
    setBusy(`oauth:${serverId}`); setError(null); setNotice(null);
    try {
      const r = await fetch("/api/platform/mcp-servers/oauth/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverId,
          ...(opts?.scopes ? { scopes: opts.scopes } : {}),
          ...(opts?.clientId ? { clientId: opts.clientId } : {}),
          ...(opts?.clientSecret ? { clientSecret: opts.clientSecret } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not start the OAuth sign-in");
      window.location.href = d.authorizationUrl as string;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the OAuth sign-in");
      setBusy(null);
      return false;
    }
  };

  const disconnectOAuth = async (s: McpServer) => {
    setBusy(s.id); setConfirmOauthDisconnectId(null); setError(null); setNotice(null);
    try {
      const r = await fetch("/api/platform/mcp-servers/oauth/disconnect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId: s.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not disconnect the OAuth sign-in");
      await load(); setNotice(`OAuth tokens removed for ${s.displayName}. Organisations lose access until you sign in again.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not disconnect the OAuth sign-in"); }
    finally { setBusy(null); }
  };

  const save = async () => {
    setFormError(null);
    if (!form.serverKey.trim() || !/^[a-z][a-z0-9_-]{1,62}$/.test(form.serverKey)) { setFormError("Server key: lowercase letter followed by 2-63 lowercase letters, digits, dashes or underscores."); return; }
    if (!form.displayName.trim()) { setFormError("Display name is required."); return; }
    if (!form.endpointUrl.trim()) { setFormError("HTTPS endpoint is required."); return; }
    if (form.authMode === "bearer" && !editing && form.bearerToken.trim() && form.bearerToken.trim().length < 8) { setFormError("The bearer token looks too short — paste the full API key or token."); return; }
    if (form.authMode === "oauth" && form.useManualClient && !form.manualClientId.trim()) { setFormError("Enter the manually registered OAuth client id, or turn off manual client to use automatic registration."); return; }
    const plans = form.plans.split(",").map(s => s.trim()).filter(Boolean);
    if (!plans.length) { setFormError("At least one allowed plan (or *) is required."); return; }
    // Tools: discovered (selected) + any already-registered tools being kept.
    const discoveredTools = (probe?.tools ?? []).filter(t => selectedTools[t.name]).map(t => ({ name: t.name, approved: false, allowedSurfaces: ["chat", "realtime"] as string[] }));
    const existingTools = editing ? editing.tools.map(t => ({ name: t.name, approved: t.approved, allowedSurfaces: t.allowedSurfaces })) : [];
    const merged = [...existingTools];
    for (const t of discoveredTools) if (!merged.some(m => m.name === t.name)) merged.push(t);
    setBusy("form"); setNotice(null); setError(null);
    try {
      const body = {
        displayName: form.displayName.trim(), description: form.description.trim(),
        endpointUrl: form.endpointUrl.trim(), authMode: form.authMode,
        allowedPlans: plans, platformEnabled: editing?.platformEnabled ?? false, tools: merged,
        ...(form.authMode === "bearer" && form.bearerToken.trim() ? { bearerToken: form.bearerToken.trim() } : {}),
      };
      const r = await fetch("/api/platform/mcp-servers", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...body } : { serverKey: form.serverKey.trim(), ...body }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save MCP server");
      // OAuth servers: go straight to the provider's sign-in page after
      // registering — the tools can only be discovered once authorized.
      if (!editing && form.authMode === "oauth") {
        const started = await startOAuth(d.id as string, {
          scopes: form.scopes.trim() || undefined,
          clientId: form.useManualClient ? form.manualClientId.trim() : undefined,
          clientSecret: form.useManualClient && form.manualClientSecret.trim() ? form.manualClientSecret.trim() : undefined,
        });
        if (started) return; // browser navigates to the authorization server
      }
      closeDialog(); await load();
      setNotice(editing
        ? `${form.displayName.trim()} updated.`
        : form.authMode === "oauth"
          ? `${form.displayName.trim()} registered. Complete the sign-in when redirected, then test the connection to import tools.`
          : `${form.displayName.trim()} registered disabled. Approve its tools, then enable it for organisations.`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save MCP server");
    } finally { setBusy(null); }
  };

  const patchServer = async (s: McpServer, body: Record<string, unknown>, message: string) => {
    setBusy(s.id); setError(null); setNotice(null);
    try {
      const r = await fetch("/api/platform/mcp-servers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, ...body }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not update MCP server");
      await load(); setNotice(message);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update MCP server"); }
    finally { setBusy(null); }
  };

  const deleteServer = async (s: McpServer) => {
    setBusy(s.id); setError(null); setNotice(null); setConfirmDeleteId(null);
    try {
      const r = await fetch("/api/platform/mcp-servers", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not delete MCP server");
      await load(); setNotice(`${s.displayName} deleted with its tools, connections and grants.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete MCP server"); }
    finally { setBusy(null); }
  };

  /** Per-server live test. Without a typed override the backend uses the
   *  stored platform credential (bearer token or refreshed OAuth token). */
  const testServer = async (s: McpServer) => {
    setBusy(`test:${s.id}`); setTestResult(v => ({ ...v, [s.id]: null }));
    try {
      const allowOverride = s.authMode === "bearer" && !s.hasPlatformCredential;
      const r = await fetch("/api/platform/mcp-servers/test", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId: s.id, ...(allowOverride && testToken.trim() ? { bearerToken: testToken.trim() } : {}) }),
      });
      const d = await r.json();
      setTestResult(v => ({ ...v, [s.id]: d.probe ?? { ok: false, durationMs: 0, error: d.error ?? "Probe failed" } }));
    } catch (e) {
      setTestResult(v => ({ ...v, [s.id]: { ok: false, durationMs: 0, error: e instanceof Error ? e.message : "Probe failed" } }));
    } finally { setBusy(null); }
  };

  /** Import the tools from a successful card-level test into the allowlist. */
  const importTestTools = async (s: McpServer, result: ProbeResult) => {
    const discovered = (result.tools ?? []).map(t => ({ name: t.name, approved: false, allowedSurfaces: ["chat", "realtime"] as string[] }));
    const merged = [...s.tools.map(t => ({ name: t.name, approved: t.approved, allowedSurfaces: t.allowedSurfaces }))];
    for (const t of discovered) if (!merged.some(m => m.name === t.name)) merged.push(t);
    await patchServer(s, { tools: merged }, `${discovered.length} discovered tool${discovered.length !== 1 ? "s" : ""} imported (unapproved). Review and approve them below.`);
  };

  const enabledCount = servers.filter(s => s.platformEnabled).length;
  const dialogOpen = showRegister;

  return <div className="min-w-0 space-y-6">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-semibold">MCP servers</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connect any Model Context Protocol server — n8n, Notion, GitHub, Linear, your own build or any public MCP endpoint. Register it, authenticate (no auth, API key, or OAuth sign-in), discover its tools with a live handshake, and control the allowlist organisations can grant to agents.</p>
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>{notice}</div>}

    {/* Header row: stats + actions */}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{servers.length} server{servers.length !== 1 ? "s" : ""} registered</span>
        <span className="text-muted-foreground/40">&middot;</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{enabledCount} enabled</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50" aria-label="Refresh" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>
        </button>
        <button onClick={openRegister} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4"/>Register server
        </button>
      </div>
    </div>

    {/* Loading */}
    {loading && !servers.length && <div className="flex items-center justify-center rounded-2xl border border-dashed border-border py-14 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Loading MCP servers…</div>}

    {/* Empty state */}
    {!loading && !servers.length && !error && <div className="rounded-2xl border border-dashed border-border p-10 text-center sm:p-14">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><Cable className="h-6 w-6 text-primary"/></div>
      <h2 className="mt-4 text-base font-semibold">No MCP servers registered</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Register any Streamable HTTP MCP server — an automation hub like n8n, a SaaS tool with an MCP endpoint, or your own server. Discover its tools with a live handshake, approve the allowlist, then enable it for organisations.</p>
      <button onClick={openRegister} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4"/>Register your first server</button>
    </div>}

    {/* Server cards */}
    <div className="space-y-3">
      {servers.map(s => {
        const meta = statusMeta(s);
        const auth = authMeta(s);
        const approvedCount = s.tools.filter(t => t.approved).length;
        const expanded = expandedId === s.id;
        const test = testResult[s.id] ?? null;
        return <div key={s.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <button onClick={() => setExpandedId(expanded ? null : s.id)} className="flex min-w-0 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:p-5" aria-expanded={expanded}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><Globe className="h-5 w-5 text-primary"/></div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate font-semibold" title={s.displayName}>{s.displayName}</h2>
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label}/>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><Globe className="h-2.5 w-2.5"/>Streamable HTTP</span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${auth.chip}`}><auth.icon className="h-2.5 w-2.5"/>{auth.label}</span>
                {s.tools.length > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"><Wrench className="h-2.5 w-2.5"/>{s.tools.length}</span>}
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}><meta.icon className="h-2.5 w-2.5"/>{meta.label}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.endpointUrl}</p>
            </div>
            <div className="shrink-0 pt-1 text-muted-foreground">{expanded ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}</div>
          </button>

          {expanded && <div className="border-t border-border">
            {s.description && <div className="border-b border-border px-4 py-3 sm:px-5"><p className="text-xs text-muted-foreground">{s.description}</p></div>}

            {s.authMode === "oauth" && s.oauthStatus === "error" && s.oauthError && <div className="flex items-start gap-2 border-b border-border bg-red-500/5 px-4 py-2.5 text-xs text-red-600 sm:px-5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span className="break-words">{s.oauthError}</span></div>}

            <div className="space-y-2 border-b border-border px-4 py-3 sm:px-5">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
                <span className="font-medium text-muted-foreground">Server key</span><span className="truncate font-mono">{s.serverKey}</span>
                <span className="font-medium text-muted-foreground">Auth</span><span>
                  {s.authMode === "none" ? "None" : s.authMode === "bearer" ? (s.hasPlatformCredential ? "Bearer — platform key stored, orgs may override" : "Bearer — organisation-supplied tokens") : `OAuth — ${s.oauthStatus === "connected" ? `connected${s.oauthConnectedAt ? ` ${new Date(s.oauthConnectedAt).toLocaleString()}` : ""}` : s.oauthStatus}`}
                </span>
                <span className="font-medium text-muted-foreground">Plans</span><span>{s.allowedPlans.join(", ") || "—"}</span>
                <span className="font-medium text-muted-foreground">Updated</span><span>{new Date(s.updatedAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Tools allowlist */}
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Wrench className="h-3.5 w-3.5"/>Tools ({approvedCount}/{s.tools.length} approved)</h3>
                {s.tools.some(t => !t.approved) && <button onClick={() => void patchServer(s, { tools: s.tools.map(t => ({ ...t, approved: true })) }, "All tools approved.")} disabled={busy===s.id} className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Approve all</button>}
              </div>
              <div className="grid gap-1.5">
                {s.tools.map(t => <div key={t.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <div className="min-w-0"><p className="truncate font-mono text-xs font-medium" title={t.name}>{t.name}</p><p className="text-[11px] text-muted-foreground">{t.allowedSurfaces.join(", ")}</p></div>
                  <button disabled={busy===s.id} onClick={() => void patchServer(s, { tools: s.tools.map(x => x.name === t.name ? { ...x, approved: !x.approved } : x) }, `${t.name} ${t.approved ? "approval revoked" : "approved"}.`)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${t.approved ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>{t.approved ? "Revoke" : "Approve"}</button>
                </div>)}
                {!s.tools.length && <p className="text-xs text-muted-foreground">No tools registered yet. Run a connection test and import the discovered tools, or edit the server and use Discover.</p>}
              </div>
            </div>

            {/* Test result */}
            {test && <div className={`border-b border-border px-4 py-2.5 text-xs sm:px-5 ${test.ok ? "bg-emerald-500/5 text-emerald-700" : "bg-red-500/5 text-red-600"}`}>
              <div className="flex items-start gap-2">
                {test.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0"/> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{test.ok ? `Handshake succeeded in ${test.durationMs} ms${test.serverInfo?.name ? ` — ${test.serverInfo.name}` : ""}${test.serverInfo?.version ? ` v${test.serverInfo.version}` : ""} (protocol ${test.serverInfo?.protocolVersion ?? "?"})` : "Handshake failed"}</p>
                  <p className="mt-0.5 break-words">{test.ok ? `${test.toolCount} tool${test.toolCount !== 1 ? "s" : ""} discovered: ${(test.tools ?? []).map(t => t.name).slice(0, 12).join(", ")}${(test.toolCount ?? 0) > 12 ? "…" : ""}` : test.error}</p>
                  {test.ok && (test.tools ?? []).some(t => !s.tools.some(x => x.name === t.name)) && <button onClick={() => void importTestTools(s, test)} disabled={busy===s.id} className="mt-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50">Import discovered tools into the allowlist</button>}
                </div>
              </div>
            </div>}

            {/* Actions */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button onClick={() => void testServer(s)} disabled={busy===`test:${s.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40" title="Run a live initialize + tools/list handshake with the stored credential">
                  {busy===`test:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Zap className="h-3.5 w-3.5"/>}Test connection
                </button>
                {s.authMode === "bearer" && !s.hasPlatformCredential && <div className="flex min-w-0 items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/>
                  <input type="password" value={testToken} onChange={e => setTestToken(e.target.value)} placeholder="API key for this test (not stored)" autoComplete="new-password" className="min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"/>
                </div>}
                {s.authMode === "oauth" && (s.oauthStatus === "connected"
                  ? (confirmOauthDisconnectId === s.id
                      ? <button onClick={() => void disconnectOAuth(s)} onBlur={() => setConfirmOauthDisconnectId(null)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"><LogOut className="h-3.5 w-3.5"/>Confirm disconnect</button>
                      : <button onClick={() => setConfirmOauthDisconnectId(s.id)} disabled={busy===s.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"><LogOut className="h-3.5 w-3.5"/>Disconnect OAuth</button>)
                  : <button onClick={() => void startOAuth(s.id)} disabled={busy===`oauth:${s.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {busy===`oauth:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <LogIn className="h-3.5 w-3.5"/>}{s.oauthStatus === "error" ? "Sign in again" : "Sign in with OAuth"}
                    </button>)}
                <button onClick={() => openEdit(s)} disabled={busy===s.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"><Pencil className="h-3.5 w-3.5"/>Edit</button>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button disabled={busy===s.id} onClick={() => void patchServer(s, { platformEnabled: !s.platformEnabled }, `${s.displayName} ${s.platformEnabled ? "disabled" : "enabled"}.`)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${s.platformEnabled ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
                  {s.platformEnabled ? <><ShieldOff className="h-3.5 w-3.5"/>Disable server</> : <><ShieldCheck className="h-3.5 w-3.5"/>Enable server</>}
                </button>
                {confirmDeleteId === s.id
                  ? <button onClick={() => void deleteServer(s)} onBlur={() => setConfirmDeleteId(null)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"><AlertCircle className="h-3.5 w-3.5"/>Confirm delete</button>
                  : <button onClick={() => setConfirmDeleteId(s.id)} disabled={busy===s.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5"/>Delete</button>}
              </div>
            </div>
          </div>}
        </div>;
      })}
    </div>

    {/* Register / Edit dialog with live discovery */}
    {dialogOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="mcp-register-title" className="my-auto box-border max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-2xl overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2"><Cable className="h-5 w-5 text-primary"/></div>
          <div className="min-w-0"><h2 id="mcp-register-title" className="text-lg font-semibold">{editing ? `Edit ${editing.displayName}` : "Register MCP server"}</h2><p className="mt-1 text-sm text-muted-foreground">{editing ? "Update the registration, then re-run discovery to import new tools." : "Any Streamable HTTP MCP server works. Run a live handshake to import its real tools, then save. Servers start disabled."}</p></div>
        </div>
        <button onClick={closeDialog} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4"/></button>
      </div>

      {formError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{formError}</div>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-sm font-medium">Server key{editing ? " (fixed)" : " *"}</span><input value={form.serverKey} onChange={e => setForm(f => ({ ...f, serverKey: e.target.value }))} disabled={Boolean(editing)} placeholder="my-mcp-server" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"/><span className="text-xs text-muted-foreground">Lowercase letters, digits, dashes and underscores. Cannot change after creation.</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Display name *</span><input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Automation hub tools" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/></label>
        <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">HTTPS endpoint *</span><input value={form.endpointUrl} onChange={e => setForm(f => ({ ...f, endpointUrl: e.target.value }))} placeholder="https://example.com/mcp" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Streamable HTTP transport — the standard MCP endpoint any compliant server exposes. Public HTTPS DNS host required; private and link-local addresses are rejected.</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Authentication</span><select value={form.authMode} onChange={e => setForm(f => ({ ...f, authMode: e.target.value as AuthMode }))} className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
          {AUTH_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select><span className="text-xs text-muted-foreground">{AUTH_MODE_OPTIONS.find(o => o.value === form.authMode)?.hint}</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Allowed plans</span><input value={form.plans} onChange={e => setForm(f => ({ ...f, plans: e.target.value }))} placeholder="pro,enterprise" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Comma-separated plan IDs, or * for all plans.</span></label>

        {form.authMode === "bearer" && <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">{editing?.hasPlatformCredential ? "Replace bearer token" : "Bearer token / API key"}</span><input type="password" value={form.bearerToken} onChange={e => setForm(f => ({ ...f, bearerToken: e.target.value }))} autoComplete="new-password" placeholder={editing?.hasPlatformCredential ? "Leave blank to keep the current token" : "API key or token this server expects (e.g. n8n: Settings → n8n API)"} className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Stored encrypted and used for connection tests and as the default credential for organisations — each organisation can still connect with its own token instead.</span></label>}

        {form.authMode === "oauth" && <>
          <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">OAuth scopes (optional)</span><input value={form.scopes} onChange={e => setForm(f => ({ ...f, scopes: e.target.value }))} placeholder="Leave blank to use the scopes the server advertises" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Comma or space separated. After saving you'll be redirected to the server's sign-in page to authorize Clara; the platform then stores and auto-refreshes the tokens.</span></label>
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3 sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={form.useManualClient} onChange={e => setForm(f => ({ ...f, useManualClient: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0"/>
              <span className="min-w-0"><span className="text-sm font-medium">Use a manually registered OAuth client</span><span className="block text-xs text-muted-foreground">Only needed when the server's authorization provider does not support automatic (dynamic) client registration. Register an application with the provider using redirect URI <span className="font-mono break-all">{typeof window !== "undefined" ? `${window.location.origin}/api/platform/mcp-servers/oauth/callback` : "/api/platform/mcp-servers/oauth/callback"}</span></span></span>
            </label>
            {form.useManualClient && <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5"><span className="text-xs font-medium">Client ID *</span><input value={form.manualClientId} onChange={e => setForm(f => ({ ...f, manualClientId: e.target.value }))} placeholder="OAuth client id from the provider" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"/></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium">Client secret (if issued)</span><input type="password" value={form.manualClientSecret} onChange={e => setForm(f => ({ ...f, manualClientSecret: e.target.value }))} autoComplete="new-password" placeholder="Public PKCE clients leave this blank" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"/></label>
            </div>}
          </div>
        </>}

        <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">Description</span><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full min-w-0 resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/></label>
      </div>

      {/* Discovery — not applicable to OAuth servers before their first sign-in */}
      {form.authMode !== "oauth" && <div className="mt-5 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          {form.authMode === "bearer" && !editing?.hasPlatformCredential && <label className="min-w-0 flex-1 space-y-1.5"><span className="text-xs font-medium">Token for this handshake</span><input type="password" value={form.bearerToken} onChange={e => setForm(f => ({ ...f, bearerToken: e.target.value }))} autoComplete="new-password" placeholder="Same token will be stored encrypted on save" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"/></label>}
          <button onClick={() => void runDiscovery()} disabled={probing || !form.endpointUrl.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {probing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Zap className="h-4 w-4"/>}{probing ? "Handshaking…" : "Discover tools"}
          </button>
        </div>
        {probe && !probe.ok && <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span className="break-words">{probe.error}</span></div>}
        {probe?.ok && <div className="mt-3 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Connected in {probe.durationMs} ms{probe.serverInfo?.name ? ` — ${probe.serverInfo.name}` : ""}{probe.serverInfo?.version ? ` v${probe.serverInfo.version}` : ""} · protocol {probe.serverInfo?.protocolVersion}</p>
          <p className="text-xs text-muted-foreground">Select the tools to import into the platform allowlist. Imported tools start unapproved — review and approve them after saving.</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background">
            {(probe.tools ?? []).map(t => <label key={t.name} className="flex cursor-pointer items-start gap-2.5 border-b border-border/60 px-3 py-2 last:border-0 hover:bg-muted/40">
              <input type="checkbox" checked={selectedTools[t.name] ?? false} onChange={e => setSelectedTools(v => ({ ...v, [t.name]: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0"/>
              <div className="min-w-0"><p className="truncate font-mono text-xs font-medium">{t.name}</p>{t.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{t.description}</p>}</div>
            </label>)}
          </div>
          <p className="text-[11px] text-muted-foreground">{Object.values(selectedTools).filter(Boolean).length} of {(probe.toolCount ?? 0)} tools selected</p>
        </div>}
        {!probe && <p className="mt-2 text-xs text-muted-foreground">Discovery runs a real MCP handshake (initialize + tools/list) from this server against the endpoint — paste the server's API key first when it requires one.</p>}
      </div>}

      <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{form.authMode === "oauth"
          ? (editing ? "Configuration saves immediately; use Sign in on the server card to (re)authorize." : "After registering you'll be redirected to the provider's sign-in page.")
          : (editing ? "Existing tools are kept; discovered tools are added." : "Servers register disabled — approve tools, then enable.")}</span>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button onClick={closeDialog} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => void save()} disabled={busy==="form"} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy==="form" ? "Saving…" : editing ? "Save changes" : form.authMode === "oauth" ? "Register and sign in" : "Register server"}</button>
        </div>
      </div>
    </div></div>}
  </div>;
}
