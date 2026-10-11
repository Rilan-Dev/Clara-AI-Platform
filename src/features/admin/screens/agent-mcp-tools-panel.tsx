"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, CircleSlash,
  Globe, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, Wrench, X,
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

function connectionMeta(s: Server) {
  switch (s.connectionStatus) {
    case "connected": return { label: "Connected", chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 };
    case "configured": return { label: "Credentials saved", chip: "border-amber-500/25 bg-amber-500/10 text-amber-700", icon: KeyRound };
    case "error": return { label: `Error: ${s.lastErrorCode ?? "unknown"}`, chip: "border-red-500/25 bg-red-500/10 text-red-600", icon: AlertCircle };
    default: return { label: "Not connected", chip: "border-border bg-muted text-muted-foreground", icon: CircleSlash };
  }
}

/** A single readiness gate rendered in the expanded server card. */
function Gate({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div
      title={hint}
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        ok ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-amber-500/25 bg-amber-500/10 text-amber-700"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3 shrink-0"/> : <AlertCircle className="h-3 w-3 shrink-0"/>}
      <span className="truncate">{label}</span>
    </div>
  );
}

/** Compact agent-grant toggle with an explanatory tooltip when disabled. */
function AgentGrantSwitch({
  checked, disabled, reason, onToggle, label,
}: { checked: boolean; disabled: boolean; reason: string; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      title={disabled ? reason : undefined}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[1.4rem]" : "left-0.5"}`}/>
    </button>
  );
}

export default function AgentMcpToolsPanel() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const [servers, setServers] = useState<Server[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id || !agentId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers?agentId=${agentId}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load MCP servers");
      setServers(d.servers ?? []);
      setPlanId(d.plan?.id ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load MCP servers");
    } finally { setLoading(false); }
  }, [id, agentId]);
  useEffect(() => { void load(); }, [load]);

  const toggleTool = async (server: Server, tool: Tool) => {
    setBusy(server.id + tool.name); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverId: server.id, action: "grant-agent-tool", agentId, toolName: tool.name, enabled: !tool.agentEnabled }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not update agent MCP grant");
      await load();
      setNotice(`${tool.name} ${tool.agentEnabled ? "revoked from" : "granted to"} ${server.displayName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update agent MCP grant");
    } finally { setBusy(null); }
  };

  /** Sequentially apply an enable/disable intent to every tool of a server. */
  const bulk = async (server: Server, enable: boolean) => {
    const approved = server.tools.filter(t => t.approved);
    const targets = enable
      ? approved.filter(t => t.organisationEnabled && !t.agentEnabled)
      : approved.filter(t => t.agentEnabled);
    if (!targets.length) return;
    setBusy(`bulk:${server.id}`); setError(null); setNotice(null);
    try {
      let failures = 0;
      for (const tool of targets) {
        const r = await fetch(`/api/orgs/${id}/mcp-servers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ serverId: server.id, action: "grant-agent-tool", agentId, toolName: tool.name, enabled: enable }),
        });
        if (!r.ok) failures += 1;
      }
      await load();
      if (failures) setError(`${failures} of ${targets.length} tool grants failed — retry or grant tools individually.`);
      else setNotice(enable ? `${targets.length} tools granted to this agent.` : `${targets.length} agent tool grants revoked.`);
    } finally { setBusy(null); }
  };

  const readyServers = servers.filter(s => s.tools.some(t => t.agentEnabled)).length;

  const serverView = (s: Server) => {
    const approved = s.tools.filter(t => t.approved);
    const connectionReady = ["configured", "connected"].includes(s.connectionStatus ?? "");
    const orgGranted = approved.filter(t => t.organisationEnabled).length;
    const agentGranted = approved.filter(t => t.agentEnabled).length;
    const meta = connectionMeta(s);
    const expanded = expandedId === s.id;
    const query = (search[s.id] ?? "").trim().toLowerCase();
    const visibleTools = query
      ? approved.filter(t => t.name.toLowerCase().includes(query))
      : approved;
    const bulkBusy = busy === `bulk:${s.id}`;

    // First failing gate drives the headline guidance inside the card.
    const blocking = !s.platformEnabled
      ? { title: "Disabled by platform administration", detail: "This MCP server was disabled by the platform administrator. Existing agent grants keep working until revoked, but no new grants can be made." }
      : !s.planAllowed
        ? { title: `Not included in the ${planId || "current"} plan`, detail: `Your subscription plan does not include this MCP server. It becomes available to this agent once the organisation upgrades${s.allowedPlans.length ? ` (requires ${s.allowedPlans.join(", ")})` : ""}.` }
        : !connectionReady
          ? { title: "Organisation connection required", detail: "An organisation admin must first connect this server with credentials in Organisation → Integrations. Tools can then be granted to this organisation and to agents." }
          : orgGranted === 0
            ? { title: "No organisation tool grants yet", detail: `An organisation admin must grant at least one of the ${approved.length} approved tools to the organisation before this agent can use them.` }
            : null;

    return (
      <div key={s.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Collapsed header — everything important at a glance */}
        <button
          onClick={() => setExpandedId(expanded ? null : s.id)}
          className="flex min-w-0 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30"
          aria-expanded={expanded}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60">
            <Globe className="h-5 w-5 text-primary"/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold" title={s.displayName}>{s.displayName}</h3>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>
                <meta.icon className="h-2.5 w-2.5"/>{meta.label}
              </span>
              {approved.length > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                  <Wrench className="h-2.5 w-2.5"/>{approved.length} tools
                </span>
              )}
              {agentGranted > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <ShieldCheck className="h-2.5 w-2.5"/>{agentGranted} granted to agent
                </span>
              )}
              {!s.planAllowed && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  Plan required
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground [overflow-wrap:anywhere]" title={s.endpointUrl}>{s.endpointUrl}</p>
          </div>
          <div className="shrink-0 pt-1 text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border">
            {s.description && (
              <div className="border-b border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            )}

            {/* Readiness gates — make the platform → plan → organisation → agent chain explicit */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-3">
              <Gate ok={s.platformEnabled} label="Platform" hint={`Platform administration has ${s.platformEnabled ? "enabled" : "disabled"} this MCP server`}/>
              <Gate ok={s.planAllowed} label={planId ? `${planId} plan` : "Plan"} hint={s.planAllowed ? "The organisation's subscription plan includes this server" : "The organisation's subscription plan does not include this server"}/>
              <Gate ok={connectionReady} label={meta.label} hint={`Organisation connection: ${meta.label}`}/>
              <Gate ok={orgGranted > 0} label={`Org grants ${orgGranted}/${approved.length}`} hint={`${orgGranted} of ${approved.length} approved tools are granted to the organisation`}/>
            </div>

            {blocking && (
              <div className="flex items-start gap-2 border-b border-border bg-amber-500/5 px-4 py-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"/>
                <div className="min-w-0 text-xs text-amber-700">
                  <p className="font-semibold">{blocking.title}</p>
                  <p className="mt-0.5">{blocking.detail}</p>
                  {(!connectionReady || orgGranted === 0) && (
                    <Link
                      href={`/orgs/${id}/integrations`}
                      className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                    >
                      Go to Organisation → Integrations <ArrowRight className="h-3 w-3"/>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Search + bulk actions */}
            {approved.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
                  <input
                    value={search[s.id] ?? ""}
                    onChange={e => setSearch(v => ({ ...v, [s.id]: e.target.value }))}
                    placeholder={`Search ${approved.length} tools…`}
                    className="w-full min-w-0 rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={`Search ${s.displayName} tools`}
                  />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => void bulk(s, true)}
                    disabled={bulkBusy || !s.platformEnabled || !s.planAllowed || !connectionReady || orgGranted === 0 || agentGranted >= orgGranted}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    title="Grant every organisation-granted tool to this agent"
                  >
                    {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                    {bulkBusy ? "Granting…" : "Grant all available"}
                  </button>
                  <button
                    onClick={() => void bulk(s, false)}
                    disabled={bulkBusy || agentGranted === 0}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                    title="Revoke every agent tool grant on this server"
                  >
                    {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : null}
                    {bulkBusy ? "Revoking…" : "Revoke all"}
                  </button>
                </div>
              </div>
            )}

            {/* Tool list — bounded height with internal scroll so long catalogues
                (e.g. 39 n8n tools) never turn the page into an endless scroll */}
            <div className="px-4 py-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Wrench className="h-3.5 w-3.5"/>
                Approved tools
                {query && <span className="font-normal normal-case">· {visibleTools.length} of {approved.length} shown</span>}
              </h4>
              {approved.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tools have been approved by platform administration for this server yet.</p>
              ) : visibleTools.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tools match “{search[s.id] ?? ""}”.</p>
              ) : (
                <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
                  {visibleTools.map(t => {
                    const canGrant = s.platformEnabled && s.planAllowed && connectionReady && t.organisationEnabled;
                    const reason = !s.platformEnabled
                      ? "Disabled by platform administration"
                      : !s.planAllowed
                        ? `Not included in the ${planId || "current"} plan`
                        : !connectionReady
                          ? "Organisation connection required"
                          : !t.organisationEnabled
                            ? "Requires an organisation tool grant (Organisation → Integrations)"
                            : "";
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
                              ? <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5"/>Org granted</span>
                              : <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600"><X className="h-2.5 w-2.5"/>Org grant needed</span>}
                          </div>
                        </div>
                        <AgentGrantSwitch
                          checked={t.agentEnabled}
                          disabled={busy !== null || (!t.agentEnabled && !canGrant)}
                          reason={reason}
                          label={`${t.agentEnabled ? "Revoke" : "Grant"} ${t.name} ${t.agentEnabled ? "from" : "to"} this agent`}
                          onToggle={() => void toggleTool(s, t)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-4" aria-labelledby="agent-mcp-heading">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="agent-mcp-heading" className="text-lg font-semibold">MCP servers &amp; tools</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Platform-approved Model Context Protocol servers. An organisation admin connects the server and grants tools to the organisation first — then grant individual tools to this agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {servers.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary"/>{readyServers} of {servers.length} in use
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            aria-label="Refresh MCP servers"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>{notice}
        </div>
      )}

      {loading && !servers.length && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin"/>Loading MCP servers…
        </p>
      )}
      {!loading && !servers.length && !error && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <Globe className="h-5 w-5 text-muted-foreground"/>
          </div>
          <p className="mt-3 text-sm font-medium">No MCP servers available yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Platform administration has not enabled any MCP servers for this organisation. Enabled servers appear here automatically.
          </p>
        </div>
      )}

      <div className="space-y-3">{servers.map(serverView)}</div>
    </section>
  );
}
