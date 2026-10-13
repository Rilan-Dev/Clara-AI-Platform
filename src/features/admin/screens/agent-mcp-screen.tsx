"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentMcpToolsSection } from "./agent-mcp-tools-screen";
import { useParams } from "next/navigation";
import {
  AlertCircle, Cable, CheckCircle2, ChevronRight, CircleSlash, Copy, Globe,
  KeyRound, Loader2, RefreshCw, Search, ShieldCheck, Wrench, X, Zap,
} from "lucide-react";

type Tool = {
  name: string;
  approved: boolean;
  allowedSurfaces: string[];
  organisationEnabled: boolean;
  agentEnabled: boolean;
};
type Server = {
  id: string;
  serverKey: string;
  displayName: string;
  description: string;
  endpointUrl: string;
  authMode: "none" | "bearer" | "oauth";
  platformEnabled: boolean;
  planAllowed: boolean;
  allowedPlans: string[];
  connectionStatus: string | null;
  lastConnectedAt: string | null;
  lastErrorCode: string | null;
  tools: Tool[];
};
type ProbeResult = {
  ok: boolean;
  durationMs: number;
  serverInfo?: { name: string | null; version: string | null; protocolVersion: string | null } | null;
  toolCount?: number;
  tools?: Array<{ name: string; description: string | null }>;
  error?: string;
  errorCode?: string;
};

function connectionMeta(s: Server) {
  switch (s.connectionStatus) {
    case "connected": return { label: "Connected", dot: "bg-emerald-500", chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
    case "configured": return { label: "Credentials saved", dot: "bg-amber-500", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700", icon: KeyRound };
    case "error": return { label: `Error: ${s.lastErrorCode ?? "unknown"}`, dot: "bg-red-500", chip: "border-red-500/25 bg-red-500/10 text-red-600", icon: AlertCircle };
    default: return { label: "Not connected", dot: "bg-muted-foreground/40", chip: "border-border bg-muted text-muted-foreground", icon: CircleSlash };
  }
}

function authLabel(s: Server) {
  if (s.authMode === "oauth") return "Platform OAuth";
  if (s.authMode === "bearer") return "Bearer token";
  return "No auth";
}

/** Small pill showing one readiness gate. */
function Gate({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <span
      title={hint}
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-amber-500/25 bg-amber-500/10 text-amber-700"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

export default function AgentMcpScreen() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Detail modal — one server at a time; full status lives here, the list
  // stays minimal (ChatGPT/Claude-style connectors pattern).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [testResults, setTestResults] = useState<Record<string, ProbeResult | null>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Connect dialog state (nested inside the detail modal).
  const [connectOpen, setConnectOpen] = useState(false);
  const [token, setToken] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !agentId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers?agentId=${agentId}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load MCP servers");
      setServers(d.servers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load MCP servers");
    } finally { setLoading(false); }
  }, [id, agentId]);
  useEffect(() => { void load(); }, [load]);

  const detail = useMemo(() => servers.find(s => s.id === detailId) ?? null, [servers, detailId]);

  const openDetail = (s: Server) => {
    setDetailId(s.id);
    setSearch("");
    setConfirmDisconnect(false);
    setConnectOpen(false);
    setToken("");
    setDialogError(null);
  };
  const closeDetail = () => {
    setDetailId(null);
    setConnectOpen(false);
    setToken("");
    setDialogError(null);
  };

  const act = async (serverId: string, body: Record<string, unknown>, successMessage: string) => {
    setBusy(serverId + (body.action ?? "")); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId, ...body }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not update MCP configuration");
      await load();
      setNotice(successMessage);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update MCP configuration");
      return false;
    } finally { setBusy(null); }
  };

  const testConnection = async (s: Server) => {
    setBusy(`test:${s.id}`); setError(null); setNotice(null);
    setTestResults(v => ({ ...v, [s.id]: null }));
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId: s.id, action: "test" }),
      });
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

  const saveConnection = async (s: Server) => {
    const needsOwnToken = s.authMode === "bearer";
    if (needsOwnToken && token.trim() && token.trim().length < 8) { setDialogError("Enter the API key / bearer token for this MCP server."); return; }
    setBusy(s.id); setDialogError(null);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverId: s.id,
          action: "connect",
          ...(s.authMode === "bearer" && token.trim() ? { credentials: { bearerToken: token.trim() } } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save the connection");
      setConnectOpen(false); setToken("");
      await load();
      setNotice(s.authMode === "oauth"
        ? `${s.displayName} connected — it uses the platform's OAuth sign-in. Run a connection test to verify the handshake.`
        : `${s.displayName} credentials saved encrypted. Run a connection test to verify the handshake.`);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "Could not save the connection");
    } finally { setBusy(null); }
  };

  /** Grant one tool to the agent, creating the organisation grant first when
   *  missing so organisation admins manage everything from this screen. */
  const toggleTool = async (s: Server, tool: Tool) => {
    const next = !tool.agentEnabled;
    if (next && !tool.organisationEnabled) {
      const ok = await act(s.id, { action: "grant-tool", toolName: tool.name, enabled: true }, `${tool.name} granted to the organisation.`);
      if (!ok) return;
    }
    await act(s.id, { action: "grant-agent-tool", agentId, toolName: tool.name, enabled: next }, `${tool.name} ${next ? "granted to" : "revoked from"} ${s.displayName}.`);
  };

  const bulk = async (s: Server, enable: boolean) => {
    const approved = s.tools.filter(t => t.approved);
    const targets = enable
      ? approved.filter(t => !t.agentEnabled)
      : approved.filter(t => t.agentEnabled);
    if (!targets.length) return;
    setBusy(`bulk:${s.id}`); setError(null); setNotice(null);
    try {
      let failures = 0;
      for (const tool of targets) {
        if (enable && !tool.organisationEnabled) {
          const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ serverId: s.id, action: "grant-tool", toolName: tool.name, enabled: true }),
          });
          if (!r.ok) { failures += 1; continue; }
        }
        const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ serverId: s.id, action: "grant-agent-tool", agentId, toolName: tool.name, enabled: enable }),
        });
        if (!r.ok) failures += 1;
      }
      await load();
      if (failures) setError(`${failures} of ${targets.length} tool grants failed — retry or grant tools individually.`);
      else setNotice(enable ? `${targets.length} tools granted to this agent.` : `${targets.length} agent tool grants revoked.`);
    } finally { setBusy(null); }
  };

  const inUseCount = servers.filter(s => s.tools.some(t => t.agentEnabled)).length;

  // ── Minimal list row (like ChatGPT/Claude connectors list) ──────────────────
  const serverRow = (s: Server) => {
    const meta = connectionMeta(s);
    const approved = s.tools.filter(t => t.approved);
    const agentGranted = approved.filter(t => t.agentEnabled).length;
    const available = s.platformEnabled && s.planAllowed;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => openDetail(s)}
        className={`flex min-w-0 w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/30 ${
          available ? "" : "opacity-70"
        }`}
        aria-label={`Open ${s.displayName} details`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60">
          <Globe className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-semibold" title={s.displayName}>{s.displayName}</h3>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>
              <meta.icon className="h-2.5 w-2.5" />{meta.label}
            </span>
            {approved.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                <Wrench className="h-2.5 w-2.5" />{approved.length} tools
              </span>
            )}
            {agentGranted > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <ShieldCheck className="h-2.5 w-2.5" />{agentGranted} granted
              </span>
            )}
            {!available && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Plan required
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  };

  // ── Detail modal (full status, connection management, tool grants) ─────────
  const detailModal = () => {
    if (!detail) return null;
    const meta = connectionMeta(detail);
    const approved = detail.tools.filter(t => t.approved);
    const connectionReady = ["configured", "connected"].includes(detail.connectionStatus ?? "");
    const orgGranted = approved.filter(t => t.organisationEnabled).length;
    const agentGranted = approved.filter(t => t.agentEnabled).length;
    const available = detail.platformEnabled && detail.planAllowed;
    const query = search.trim().toLowerCase();
    const visibleTools = query ? approved.filter(t => t.name.toLowerCase().includes(query)) : approved;
    const test = testResults[detail.id] ?? null;
    const bulkBusy = busy === `bulk:${detail.id}`;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="mcp-detail-title" className="relative my-auto flex max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {/* Modal header */}
          <div className="flex min-w-0 items-start gap-3 border-b border-border p-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 id="mcp-detail-title" className="text-lg font-semibold">{detail.displayName}</h2>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>
                  <meta.icon className="h-2.5 w-2.5" />{meta.label}
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{authLabel(detail)}</span>
              </div>
              {detail.description && <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>}
            </div>
            <button onClick={closeDetail} aria-label="Close" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable modal body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Endpoint + readiness */}
            <div className="space-y-3 border-b border-border p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-xs [overflow-wrap:anywhere]" title={detail.endpointUrl}>{detail.endpointUrl}</code>
                <button type="button" className="rounded-md border border-border bg-background p-1.5" aria-label="Copy endpoint URL" onClick={() => void navigator.clipboard?.writeText(detail.endpointUrl)}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Gate ok={detail.platformEnabled} label="Platform" hint={`Platform administration has ${detail.platformEnabled ? "enabled" : "disabled"} this MCP server`} />
                <Gate ok={detail.planAllowed} label="Plan" hint={detail.planAllowed ? "The organisation's subscription plan includes this server" : "The organisation's subscription plan does not include this server"} />
                <Gate ok={connectionReady} label={meta.label} hint={`Organisation connection: ${meta.label}`} />
                <Gate ok={orgGranted > 0} label={`Org tools ${orgGranted}/${approved.length}`} hint={`${orgGranted} of ${approved.length} approved tools are granted to the organisation`} />
              </div>
              {!available && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This MCP server is not available for your plan{detail.allowedPlans.length ? ` (requires ${detail.allowedPlans.join(", ")})` : ""}.
                  {agentGranted > 0 && " Existing grants keep working until revoked."}
                </div>
              )}
              {detail.connectionStatus === "connected" && detail.lastConnectedAt && (
                <p className="text-xs text-muted-foreground">Last handshake {new Date(detail.lastConnectedAt).toLocaleString()}</p>
              )}
            </div>

            {/* Test result */}
            {test && (
              <div className={`flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs sm:px-5 ${test.ok ? "bg-emerald-500/5 text-emerald-700" : "bg-red-500/5 text-red-600"}`}>
                {test.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium">
                    {test.ok
                      ? `Handshake succeeded in ${test.durationMs} ms${test.serverInfo?.name ? ` — ${test.serverInfo.name}` : ""} (protocol ${test.serverInfo?.protocolVersion ?? "?"})`
                      : "Handshake failed"}
                  </p>
                  <p className="mt-0.5 break-words">
                    {test.ok
                      ? `${test.toolCount} tools available from the server: ${(test.tools ?? []).map(t => t.name).slice(0, 12).join(", ")}${(test.toolCount ?? 0) > 12 ? "…" : ""}`
                      : test.error}
                  </p>
                </div>
              </div>
            )}

            {/* Connection actions */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border p-4 sm:p-5">
              <p className="min-w-0 text-xs text-muted-foreground">
                {connectionReady
                  ? "The organisation connection is stored encrypted. Test it any time to verify the live handshake."
                  : available
                    ? "Connect this server with the organisation's credentials to grant its tools to agents."
                    : "Connection management is unavailable for this plan."}
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {available && (
                  <button
                    type="button"
                    onClick={() => { setConnectOpen(true); setDialogError(null); }}
                    disabled={busy === detail.id}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {detail.connectionStatus ? "Update credentials" : "Connect"}
                  </button>
                )}
                {["configured", "connected", "error"].includes(detail.connectionStatus ?? "") && (
                  <button
                    type="button"
                    onClick={() => void testConnection(detail)}
                    disabled={busy === `test:${detail.id}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    title="Run a live initialize + tools/list handshake with the stored credentials"
                  >
                    {busy === `test:${detail.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}Test connection
                  </button>
                )}
                {["configured", "connected", "error"].includes(detail.connectionStatus ?? "") && (
                  confirmDisconnect ? (
                    <button
                      type="button"
                      onClick={() => { void act(detail.id, { action: "disconnect" }, `${detail.displayName} disconnected and grants revoked.`); setConfirmDisconnect(false); }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />Confirm disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(true)}
                      disabled={busy === detail.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />Disconnect
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Tools */}
            <div className="p-4 sm:p-5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5" />Tools ({approved.length})
                </h3>
                {approved.length > 0 && available && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void bulk(detail, true)}
                      disabled={bulkBusy || !connectionReady || agentGranted >= approved.length}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                      title="Grant every tool to the organisation and this agent"
                    >
                      {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {bulkBusy ? "Granting…" : "Grant all"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void bulk(detail, false)}
                      disabled={bulkBusy || agentGranted === 0}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                      title="Revoke every agent tool grant on this server"
                    >
                      {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Revoke all
                    </button>
                  </div>
                )}
              </div>

              {approved.length > 6 && (
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={`Search ${approved.length} tools…`}
                    className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={`Search ${detail.displayName} tools`}
                  />
                </div>
              )}

              <div className="mt-3 max-h-[24rem] space-y-1.5 overflow-y-auto pr-1">
                {approved.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tools have been approved by platform administration for this server yet.</p>
                ) : visibleTools.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tools match &ldquo;{search}&rdquo;.</p>
                ) : visibleTools.map(t => {
                  const busyTool = busy !== null;
                  const canGrant = available && connectionReady;
                  return (
                    <div
                      key={t.name}
                      className={`flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                        t.agentEnabled ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/30"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs font-medium" title={t.name}>{t.name}</p>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                          {t.allowedSurfaces.map(surface => (
                            <span key={surface} className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{surface}</span>
                          ))}
                          {t.organisationEnabled
                            ? <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5" />Org</span>
                            : <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600"><X className="h-2.5 w-2.5" />Org grant needed</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={t.agentEnabled}
                        aria-label={`${t.agentEnabled ? "Revoke" : "Grant"} ${t.name} ${t.agentEnabled ? "from" : "to"} this agent`}
                        disabled={busyTool || (!t.agentEnabled && !canGrant)}
                        title={!t.agentEnabled && !available
                          ? "This MCP server is not available for your plan"
                          : !t.agentEnabled && !connectionReady
                            ? "Connect the server first"
                            : undefined}
                        onClick={() => void toggleTool(detail, t)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          t.agentEnabled ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${t.agentEnabled ? "left-[1.4rem]" : "left-0.5"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Nested connect dialog */}
          {connectOpen && (
            <div className="absolute inset-0 z-[10] flex items-center justify-center bg-black/40 p-4">
              <div role="dialog" aria-modal="true" aria-labelledby="mcp-connect-title" className="my-auto box-border max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg overflow-x-hidden overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 rounded-xl bg-primary/10 p-2"><KeyRound className="h-5 w-5 text-primary" /></div>
                    <div className="min-w-0">
                      <h2 id="mcp-connect-title" className="text-lg font-semibold">Connect {detail.displayName}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {detail.authMode === "oauth"
                          ? "This server is authorized through the platform's OAuth sign-in — no credentials are needed here."
                          : detail.authMode === "bearer"
                            ? "Save the credentials this organisation will use for MCP calls. They are encrypted server-side and never shown again."
                            : "This server needs no credentials — confirm the connection to continue."}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { setConnectOpen(false); setToken(""); setDialogError(null); }} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
                {dialogError && (
                  <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{dialogError}
                  </div>
                )}
                {detail.authMode === "bearer" && (
                  <label className="mt-4 block space-y-1.5">
                    <span className="text-sm font-medium">API key / bearer token *</span>
                    <input
                      type="password"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      autoComplete="new-password"
                      placeholder="API key or token issued by this MCP server"
                      className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-xs text-muted-foreground">Create the key in the MCP server&apos;s own settings. Saving only stores the encrypted value — run Test connection afterwards to verify the handshake.</span>
                  </label>
                )}
                <div className="mt-6 flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <button onClick={() => { setConnectOpen(false); setToken(""); setDialogError(null); }} className="min-h-10 rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
                  <button onClick={() => void saveConnection(detail)} disabled={busy === detail.id} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                    {busy === detail.id ? "Saving…" : "Save encrypted connection"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">MCP tools</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Model Context Protocol tools for this agent. The platform catalog lists servers approved by the
            platform administrator — connect one with your organisation&apos;s credentials, then grant its tools
            below. Your own MCP servers appear in the organisation-owned section underneath.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {servers.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />{inUseCount} of {servers.length} in use
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            aria-label="Refresh MCP servers"
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

      {loading && !servers.length && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading MCP servers…
        </p>
      )}
      {!loading && !servers.length && !error && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <Cable className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No MCP servers available yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            MCP servers appear here once the platform administrator enables them for your plan.
          </p>
        </div>
      )}

      <div className="space-y-3">{servers.map(serverRow)}</div>

      {detailModal()}

      <div className="mt-4 border-t border-border pt-8">
        <AgentMcpToolsSection />
      </div>
    </div>
  );
}
