"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle, ArrowRight, CheckCircle2, Loader2, PlugZap, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import AgentMcpToolsPanel from "@/features/admin/screens/agent-mcp-tools-panel";

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
};

/** Status of one integration resolved against the platform → plan → organisation chain. */
function integrationStatus(item: Item, planId: string) {
  if (!item.platformEnabled) return {
    tone: "amber" as const,
    title: "Disabled by platform administration",
    detail: "Existing agent grants can still be revoked, but this integration cannot be re-enabled here.",
  };
  if (!item.planAllowed) return {
    tone: "amber" as const,
    title: `Not included in the ${planId || "current"} plan`,
    detail: "This integration becomes available once the organisation's subscription plan covers it.",
  };
  if (!item.organisationEnabled) return {
    tone: "amber" as const,
    title: "Organisation enablement required",
    detail: "An organisation admin must enable this integration in Organisation → Integrations before agents can use it.",
    link: true,
  };
  if (!item.connected && item.authType !== "none") return {
    tone: "amber" as const,
    title: "Credentials not connected",
    detail: "An organisation admin must connect credentials in Organisation → Integrations before granting this to agents.",
    link: true,
  };
  return {
    tone: "ready" as const,
    title: "Ready for agents",
    detail: item.agentEnabled ? "Enabled for this agent." : "Toggle on to let this agent use its actions.",
  };
}

export default function AgentIntegrationsScreen() {
  const { id = "", agentId = "" } = useParams<{ id: string; agentId: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !agentId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/orgs/${id}/agents/${agentId}/integrations`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load agent integrations");
      setItems(d.integrations ?? []);
      setPlanId(d.plan?.id ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agent integrations");
    } finally { setLoading(false); }
  }, [id, agentId]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (item: Item) => {
    setBusy(item.id); setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/orgs/${id}/agents/${agentId}/integrations`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ integrationId: item.id, enabled: !item.agentEnabled }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not update agent integration");
      await load();
      setNotice(`${item.displayName} ${item.agentEnabled ? "disabled for" : "enabled for"} this agent.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update agent integration");
    } finally { setBusy(null); }
  };

  const enabledCount = items.filter(i => i.agentEnabled).length;
  const orgIntegrationsHref = `/orgs/${id}/integrations`;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <header>
        <h1 className="text-2xl font-semibold">Agent integrations &amp; tools</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Choose exactly which integrations and MCP tools this agent may use during Chat, Voice Chat and Realtime Voice tool calls.
          Access flows in three steps: the platform administrator enables an integration for your plan, an organisation admin enables it and connects credentials, and you grant it to this agent.
        </p>
      </header>

      <AgentMcpToolsPanel />

      {/* Organisation integrations */}
      <section className="space-y-4" aria-labelledby="agent-integrations-heading">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="agent-integrations-heading" className="text-lg font-semibold">Organisation integrations</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Integrations enabled by platform administration for your plan. Only these are listed — the full catalogue stays on the organisation integrations page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary"/>{enabledCount} of {items.length} enabled for agent
              </span>
            )}
            <Link
              href={orgIntegrationsHref}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PlugZap className="h-3.5 w-3.5"/>Manage organisation integrations<ArrowRight className="h-3 w-3"/>
            </Link>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              aria-label="Refresh integrations"
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

        {loading && !items.length && (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin"/>Loading integrations…
          </p>
        )}
        {!loading && !items.length && !error && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <PlugZap className="h-5 w-5 text-muted-foreground"/>
            </div>
            <p className="mt-3 text-sm font-medium">No integrations available for this agent yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Integrations appear here once the platform administrator enables them for your organisation&apos;s plan. Organisation-enabled integrations can then be granted to this agent.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => {
            const status = integrationStatus(item, planId);
            const canToggle = item.organisationEnabled && (item.connected || item.authType === "none");
            const busyItem = busy === item.id;
            return (
              <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <img src={item.logoUrl} className="h-10 w-10 shrink-0 object-contain" alt={`${item.displayName} logo`}/>
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
                    disabled={busyItem || (!item.agentEnabled && (!canToggle || !item.planAllowed || !item.platformEnabled))}
                    onClick={() => void toggle(item)}
                    title={!item.agentEnabled && !canToggle ? status.title : undefined}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      item.agentEnabled ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    {busyItem
                      ? <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground"/>
                      : <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${item.agentEnabled ? "left-[1.4rem]" : "left-0.5"}`}/>}
                  </button>
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>

                <div className="mt-4 flex-1" style={{ minHeight: 0 }}>
                  {status.tone === "ready" ? (
                    <p className={`flex items-start gap-1.5 text-xs ${item.agentEnabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{status.detail}
                    </p>
                  ) : (
                    <div className={`flex items-start gap-1.5 rounded-lg border p-2.5 text-xs ${
                      status.tone === "amber" ? "border-amber-500/25 bg-amber-500/5 text-amber-700" : ""
                    }`}>
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                      <span className="min-w-0">
                        <span className="font-semibold">{status.title}.</span>{" "}
                        {status.detail}
                        {"link" in status && status.link && (
                          <Link href={orgIntegrationsHref} className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2">
                            Open<ArrowRight className="h-3 w-3"/>
                          </Link>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {item.agentEnabled && (
                  <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    <X className="h-3.5 w-3.5"/>{item.authType === "none" ? "No credentials required" : item.connected ? "Credentials ready" : "Waiting for organisation credentials"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
