"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Cable, CheckCircle2, ChevronDown, ChevronRight, CircleSlash,
  Globe, KeyRound, Loader2, Pencil, Plus, RefreshCw, ShieldCheck, ShieldOff,
  Trash2, Wrench, X, Zap,
} from "lucide-react";

type McpTool = { name: string; approved: boolean; allowedSurfaces: string[] };
type McpServer = {
  id: string; serverKey: string; displayName: string; description: string;
  endpointUrl: string; authMode: "none" | "bearer"; platformEnabled: boolean;
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
  authMode: "none" | "bearer"; plans: string;
};

const EMPTY_FORM: ServerForm = { serverKey: "", displayName: "", endpointUrl: "", description: "", authMode: "bearer", plans: "pro,enterprise" };

function statusMeta(server: McpServer) {
  if (!server.platformEnabled) return { label: "Disabled", dot: "bg-muted-foreground/40", chip: "border-border bg-muted text-muted-foreground", icon: CircleSlash };
  if (server.tools.some(t => t.approved)) return { label: "Enabled", dot: "bg-emerald-500", chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
  return { label: "Needs tool approval", dot: "bg-amber-500", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700", icon: AlertCircle };
}

export default function McpServersScreen() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Register / edit dialog state
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Discovery state (register dialog + per-server test)
  const [probeToken, setProbeToken] = useState("");
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({});
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

  const openRegister = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null);
    setProbe(null); setProbeToken(""); setSelectedTools({});
    setShowRegister(true);
  };
  const openEdit = (s: McpServer) => {
    setEditing(s);
    setForm({
      serverKey: s.serverKey, displayName: s.displayName, endpointUrl: s.endpointUrl,
      description: s.description ?? "", authMode: s.authMode, plans: s.allowedPlans.join(","),
    });
    setFormError(null); setProbe(null); setProbeToken(""); setSelectedTools({});
    setShowRegister(true);
  };
  const closeDialog = () => { setShowRegister(false); setEditing(null); setFormError(null); setProbe(null); setProbeToken(""); setSelectedTools({}); };

  /** Live handshake against the endpoint in the form (discovery before save). */
  const runDiscovery = async () => {
    if (!form.endpointUrl.trim()) { setFormError("Enter the HTTPS endpoint first."); return; }
    setProbing(true); setFormError(null); setProbe(null);
    try {
      const r = await fetch("/api/platform/mcp-servers/test", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpointUrl: form.endpointUrl.trim(), bearerToken: probeToken.trim() || undefined }),
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

  const save = async () => {
    setFormError(null);
    if (!form.serverKey.trim() || !/^[a-z][a-z0-9_-]{1,62}$/.test(form.serverKey)) { setFormError("Server key: lowercase letter followed by 2-63 lowercase letters, digits, dashes or underscores."); return; }
    if (!form.displayName.trim()) { setFormError("Display name is required."); return; }
    if (!form.endpointUrl.trim()) { setFormError("HTTPS endpoint is required."); return; }
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
        serverKey: form.serverKey.trim(), displayName: form.displayName.trim(),
        description: form.description.trim(), endpointUrl: form.endpointUrl.trim(),
        authMode: form.authMode, allowedPlans: plans, platformEnabled: editing?.platformEnabled ?? false, tools: merged,
      };
      const r = await fetch("/api/platform/mcp-servers", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...body, serverKey: undefined } : body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save MCP server");
      closeDialog(); await load();
      setNotice(editing ? `${form.displayName.trim()} updated.` : `${form.displayName.trim()} registered disabled. Approve its tools, then enable it for organisations.`);
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

  /** Per-server live test using the registered endpoint. */
  const testServer = async (s: McpServer) => {
    setBusy(`test:${s.id}`); setTestResult(v => ({ ...v, [s.id]: null }));
    try {
      const r = await fetch("/api/platform/mcp-servers/test", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId: s.id, bearerToken: probeToken.trim() || undefined }),
      });
      const d = await r.json();
      setTestResult(v => ({ ...v, [s.id]: d.probe ?? { ok: false, durationMs: 0, error: d.error ?? "Probe failed" } }));
    } catch (e) {
      setTestResult(v => ({ ...v, [s.id]: { ok: false, durationMs: 0, error: e instanceof Error ? e.message : "Probe failed" } }));
    } finally { setBusy(null); }
  };

  const enabledCount = servers.filter(s => s.platformEnabled).length;
  const dialogOpen = showRegister;

  return <div className="min-w-0 space-y-6">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-semibold">MCP servers</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Register platform-approved Model Context Protocol servers, discover their tools with a live handshake, and manage the tool allowlist organisations can grant to agents.</p>
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
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Register a Streamable HTTP MCP server such as n8n, discover its tools with a live handshake, approve the allowlist, then enable it for organisations on Pro and Enterprise plans.</p>
      <button onClick={openRegister} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4"/>Register your first server</button>
    </div>}

    {/* Server cards */}
    <div className="space-y-3">
      {servers.map(s => {
        const meta = statusMeta(s);
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
                {s.tools.length > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"><Wrench className="h-2.5 w-2.5"/>{s.tools.length}</span>}
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}><meta.icon className="h-2.5 w-2.5"/>{meta.label}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.endpointUrl}</p>
            </div>
            <div className="shrink-0 pt-1 text-muted-foreground">{expanded ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}</div>
          </button>

          {expanded && <div className="border-t border-border">
            {s.description && <div className="border-b border-border px-4 py-3 sm:px-5"><p className="text-xs text-muted-foreground">{s.description}</p></div>}

            <div className="space-y-2 border-b border-border px-4 py-3 sm:px-5">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
                <span className="font-medium text-muted-foreground">Server key</span><span className="truncate font-mono">{s.serverKey}</span>
                <span className="font-medium text-muted-foreground">Auth</span><span>{s.authMode === "bearer" ? "Org bearer token" : "None"}</span>
                <span className="font-medium text-muted-foreground">Plans</span><span className="col-span-3">{s.allowedPlans.join(", ") || "—"}</span>
                <span className="font-medium text-muted-foreground">Updated</span><span className="col-span-3">{new Date(s.updatedAt).toLocaleString()}</span>
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
                {!s.tools.length && <p className="text-xs text-muted-foreground">No tools registered yet. Use Discover on edit, or add tool names manually.</p>}
              </div>
            </div>

            {/* Test result */}
            {test && <div className={`flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs sm:px-5 ${test.ok ? "bg-emerald-500/5 text-emerald-700" : "bg-red-500/5 text-red-600"}`}>
              {test.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0"/> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>}
              <div className="min-w-0">
                <p className="font-medium">{test.ok ? `Handshake succeeded in ${test.durationMs} ms${test.serverInfo?.name ? ` — ${test.serverInfo.name}` : ""}${test.serverInfo?.version ? ` v${test.serverInfo.version}` : ""} (protocol ${test.serverInfo?.protocolVersion ?? "?"})` : "Handshake failed"}</p>
                <p className="mt-0.5 break-words">{test.ok ? `${test.toolCount} tool${test.toolCount !== 1 ? "s" : ""} discovered: ${(test.tools ?? []).map(t => t.name).slice(0, 12).join(", ")}${(test.toolCount ?? 0) > 12 ? "…" : ""}` : test.error}</p>
              </div>
            </div>}

            {/* Actions */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button onClick={() => void testServer(s)} disabled={busy===`test:${s.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40" title="Run a live initialize + tools/list handshake against this endpoint">
                  {busy===`test:${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Zap className="h-3.5 w-3.5"/>}Test connection
                </button>
                {s.authMode === "bearer" && <div className="flex min-w-0 items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/>
                  <input type="password" value={probeToken} onChange={e => setProbeToken(e.target.value)} placeholder="API key for this test (optional)" autoComplete="new-password" className="min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"/>
                </div>}
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
          <div className="min-w-0"><h2 id="mcp-register-title" className="text-lg font-semibold">{editing ? `Edit ${editing.displayName}` : "Register MCP server"}</h2><p className="mt-1 text-sm text-muted-foreground">{editing ? "Update the registration, then re-run discovery to import new tools." : "Run a live handshake to import the server's real tools, then save. Servers start disabled."}</p></div>
        </div>
        <button onClick={closeDialog} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4"/></button>
      </div>

      {formError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{formError}</div>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-sm font-medium">Server key{editing ? " (fixed)" : " *"}</span><input value={form.serverKey} onChange={e => setForm(f => ({ ...f, serverKey: e.target.value }))} disabled={Boolean(editing)} placeholder="n8n-mcp" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"/><span className="text-xs text-muted-foreground">Lowercase letters, digits, dashes and underscores. Cannot change after creation.</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Display name *</span><input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="n8n automation tools" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/></label>
        <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">HTTPS endpoint *</span><input value={form.endpointUrl} onChange={e => setForm(f => ({ ...f, endpointUrl: e.target.value }))} placeholder="https://n8n.example.com/mcp-server/http" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Streamable HTTP transport. Public HTTPS DNS host required — private and link-local addresses are rejected.</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Authentication</span><select value={form.authMode} onChange={e => setForm(f => ({ ...f, authMode: e.target.value as "none" | "bearer" }))} className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"><option value="bearer">Organisation-provided bearer token</option><option value="none">No credentials</option></select><span className="text-xs text-muted-foreground">n8n MCP servers need a bearer token — create one in n8n Settings → n8n API.</span></label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Allowed plans</span><input value={form.plans} onChange={e => setForm(f => ({ ...f, plans: e.target.value }))} placeholder="pro,enterprise" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><span className="text-xs text-muted-foreground">Comma-separated plan IDs, or * for all plans.</span></label>
        <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-medium">Description</span><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full min-w-0 resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/></label>
      </div>

      {/* Discovery */}
      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          {form.authMode === "bearer" && <label className="min-w-0 flex-1 space-y-1.5"><span className="text-xs font-medium">API key for discovery (not stored)</span><input type="password" value={probeToken} onChange={e => setProbeToken(e.target.value)} autoComplete="new-password" placeholder="n8n API key — used only for this handshake" className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm"/></label>}
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
        {!probe && <p className="mt-2 text-xs text-muted-foreground">Discovery runs a real MCP handshake (initialize + tools/list) from this server against the endpoint. n8n: use an n8n API key as the bearer token.</p>}
      </div>

      <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{editing ? "Existing tools are kept; discovered tools are added." : "Servers register disabled — approve tools, then enable."}</span>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button onClick={closeDialog} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => void save()} disabled={busy==="form"} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy==="form" ? "Saving…" : editing ? "Save changes" : "Register server"}</button>
        </div>
      </div>
    </div></div>}
  </div>;
}
