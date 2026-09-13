"use client";

/**
 * src/features/admin/screens/org-overview-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Organisation Overview — the business owner's home screen.
 *
 * User-goal-oriented layout (answers, in order, the questions an owner has):
 *   1. "Is my subscription OK?"      → smart status banner (renew / upgrade)
 *   2. "How is my assistant doing?"  → KPI cards + 30-day usage chart
 *   3. "Where is the activity?"      → top knowledge bases + recent feed
 *   4. "What should I do next?"      → quick actions
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowUpRight, Building2, Database, FileText,
  HardDrive, LayoutDashboard, MessageSquare, Plus, RefreshCw, TrendingUp,
  UserPlus, Users, Zap, ArrowRight, Clock,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { useAuth } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OrgWorkspaceNav } from "@/components/admin/OrgWorkspaceNav";
import { Button } from "@/components/ui/button";

type DashboardData = {
  org: { id: string; name: string; slug: string };
  totals: {
    agents: number; knowledgeBases: number; documents: number; members: number;
    storageBytes: number; queriesToday: number; queries30d: number;
    queriesPrev30d: number; trendPct: number; chatSessions30d: number;
    avgLatencyMs: number | null;
  };
  queriesPerDay: { day: string; queries: number }[];
  topKnowledgeBases: {
    kb_id: string; kb_name: string; agent_id: string; agent_name: string;
    queries_30d: number; doc_count: number;
  }[];
  recentActivity: { kind: string; title: string; detail: string | null; created_at: string }[];
  subscription: Record<string, unknown> | null;
  effective: {
    planId: string; planName: string; status: string; effectiveStatus: string;
    currentPeriodEnd: string | null; daysRemaining: number | null;
    needsRenewal: boolean; needsAttention: boolean;
  } | null;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024)          return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function timeAgo(value: string): string {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60)   return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Smart subscription banner ────────────────────────────────────────────────

function SubscriptionBanner({ effective, orgId }: { effective: DashboardData["effective"]; orgId: string }) {
  if (!effective) return null;

  const renewUrl  = `/orgs/${orgId}/billing`;
  const endDate   = effective.currentPeriodEnd
    ? new Date(effective.currentPeriodEnd).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Healthy paid subscription → quiet reassurance, no loud banner.
  if (effective.effectiveStatus === "active" && effective.planId !== "free") {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-sm text-white/70">
            <span className="font-semibold text-white">{effective.planName}</span> plan active
            {endDate && <> · {effective.daysRemaining !== null && effective.daysRemaining > 0 ? `renews ${endDate}` : `renewed through ${endDate}`}</>}
          </p>
        </div>
        <Link href={renewUrl}>
          <Button variant="outline" size="sm" className="gap-2 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/10">
            Manage plan <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    );
  }

  // EXPIRED — strongest business injection: renew to restore access.
  if (effective.effectiveStatus === "expired") {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.08] px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Your {effective.planName} subscription has expired</p>
            <p className="text-sm text-white/50 mt-0.5">
              {endDate ? `Ended ${endDate}. ` : ""}Premium features and higher limits are restricted — your data is safe.
              Renew now to instantly restore full access.
            </p>
          </div>
        </div>
        <Link href={renewUrl} className="shrink-0">
          <Button className="gap-2 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600">
            <RefreshCw className="w-4 h-4" /> Renew subscription
          </Button>
        </Link>
      </div>
    );
  }

  // EXPIRING SOON — renew before interruption.
  if (effective.effectiveStatus === "expiring") {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Renewal due in {effective.daysRemaining} day{effective.daysRemaining === 1 ? "" : "s"}</p>
            <p className="text-sm text-white/50 mt-0.5">
              Your {effective.planName} plan ends {endDate}. Renew before then to keep your assistants running without interruption.
            </p>
          </div>
        </div>
        <Link href={renewUrl} className="shrink-0">
          <Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
            <RefreshCw className="w-4 h-4" /> Renew now
          </Button>
        </Link>
      </div>
    );
  }

  // TRIALING — convert with an upgrade CTA.
  if (effective.effectiveStatus === "trialing") {
    return (
      <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.08] px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <p className="font-semibold text-white">Trial {effective.daysRemaining !== null && effective.daysRemaining >= 0 ? `ends ${endDate}` : "ended"}</p>
            <p className="text-sm text-white/50 mt-0.5">Upgrade to keep your knowledge bases, voice assistant and analytics.</p>
          </div>
        </div>
        <Link href={renewUrl} className="shrink-0">
          <Button className="gap-2">
            <ArrowUpRight className="w-4 h-4" /> Choose a plan
          </Button>
        </Link>
      </div>
    );
  }

  // FREE (or paused/cancelled) with an upgrade path.
  return (
    <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
          <ArrowUpRight className="w-5 h-5 text-violet-300" />
        </div>
        <div>
          <p className="font-semibold text-white">You&apos;re on the Free plan</p>
          <p className="text-sm text-white/50 mt-0.5">
            Unlock more knowledge bases, voice assistant, API access and advanced analytics as you grow.
          </p>
        </div>
      </div>
      <Link href={renewUrl} className="shrink-0">
        <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-violet-600">
          <ArrowUpRight className="w-4 h-4" /> View plans
        </Button>
      </Link>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OrgOverviewScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const { user }    = useAuth();
  const isAdmin     = user?.isSuperAdmin ?? false;

  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch(apiUrl(`/api/orgs/${id}/dashboard`), { headers: withAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load");
        return res.json() as Promise<DashboardData>;
      })
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const totals    = data?.totals;
  const maxKbs    = Number(data?.subscription?.max_kbs ?? 1);
  const chartData = (data?.queriesPerDay ?? []).map((d) => ({
    ...d,
    label: new Date(d.day).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  }));

  const kpis = [
    { label: "Queries today",     value: totals?.queriesToday?.toLocaleString() ?? "—",       icon: Activity,     color: "text-indigo-300",   sub: null },
    { label: "Queries · 30 days", value: totals?.queries30d?.toLocaleString() ?? "—",         icon: TrendingUp,   color: "text-violet-300",   sub: totals ? `${totals.trendPct >= 0 ? "+" : ""}${totals.trendPct}% vs prev 30d` : null },
    { label: "Knowledge Bases",   value: totals ? `${totals.knowledgeBases}${maxKbs > 0 ? ` / ${maxKbs === -1 ? "∞" : maxKbs}` : ""}` : "—", icon: Database, color: "text-cyan-300", sub: null },
    { label: "Documents",         value: totals?.documents?.toLocaleString() ?? "—",          icon: FileText,     color: "text-pink-300",     sub: null },
    { label: "Storage used",      value: totals ? formatBytes(totals.storageBytes) : "—",     icon: HardDrive,    color: "text-emerald-300",  sub: null },
    { label: "Team members",      value: totals?.members?.toLocaleString() ?? "—",            icon: Users,        color: "text-amber-300",    sub: null },
  ];

  const quickActions = [
    { href: `/orgs/${id}/agents`,  icon: Plus,      label: "Create an agent",    desc: "Start a new assistant" },
    { href: `/orgs/${id}/members`, icon: UserPlus,  label: "Invite a teammate",  desc: "Grow your team" },
    { href: `/orgs/${id}/billing`, icon: ArrowUpRight, label: "Manage billing",   desc: "Plans, renewal, invoices" },
  ];

  return (
    <div className="p-6 lg:p-8">
      <AdminPageHeader
        icon={LayoutDashboard}
        title={data?.org?.name ?? "Overview"}
        description={
          isAdmin
            ? "Business health of this organisation — usage, activity and subscription lifecycle."
            : "Your assistant at a glance — usage, activity and what to do next."
        }
        breadcrumbs={isAdmin ? [{ label: "Organisations", href: "/orgs" }, { label: data?.org?.name ?? "…" }] : undefined}
      />

      <OrgWorkspaceNav orgId={id} />

      {/* Smart subscription banner — the single most important business signal */}
      {data?.effective && <SubscriptionBanner effective={data.effective} orgId={id} />}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-white/40 leading-tight">{kpi.label}</div>
              <kpi.icon className={`w-4 h-4 ${kpi.color} shrink-0`} />
            </div>
            <div className="text-xl font-black text-white">
              {loading ? <div className="h-6 w-12 bg-white/[0.06] rounded animate-pulse" /> : kpi.value}
            </div>
            {kpi.sub && (
              <div className={`text-[11px] mt-1 ${totals && totals.trendPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {kpi.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Usage chart + top KBs */}
      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white text-sm">Assistant usage — last 30 days</h3>
              <p className="text-xs text-white/30 mt-0.5">
                {totals?.chatSessions30d ?? 0} conversations · {totals?.queries30d?.toLocaleString() ?? 0} queries
                {totals?.avgLatencyMs ? ` · ~${totals.avgLatencyMs}ms avg response` : ""}
              </p>
            </div>
            <button onClick={load} className="text-white/30 hover:text-white/60 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="h-56">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#818cf8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                    axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "#13131f", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 12, fontSize: 12, color: "#fff",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                    formatter={(v) => [v, "Queries"]} />
                  <Area type="monotone" dataKey="queries" stroke="#818cf8" strokeWidth={2}
                    fill="url(#usageGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <MessageSquare className="w-8 h-8 text-white/15 mb-3" />
                <p className="text-sm text-white/40">No usage yet</p>
                <p className="text-xs text-white/25 mt-1">Chat with your assistant or embed the widget to see activity here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Top knowledge bases */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <h3 className="font-semibold text-white text-sm mb-4">Busiest knowledge bases</h3>
          {(data?.topKnowledgeBases ?? []).length > 0 ? (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {data!.topKnowledgeBases.map((kb, i) => (
                <Link key={kb.kb_id} href={`/orgs/${id}/agents/${kb.agent_id}`}
                  className="block rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 hover:bg-white/[0.05] hover:border-indigo-500/25 transition-all group">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate group-hover:text-indigo-300 transition-colors">{kb.kb_name}</p>
                      <p className="text-[11px] text-white/30 truncate">{kb.agent_name} · {kb.doc_count} docs</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-indigo-300">{kb.queries_30d}</div>
                      <div className="text-[10px] text-white/25">queries</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Database className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40">No knowledge bases yet</p>
              <Link href={`/orgs/${id}/agents`} className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-block">
                Create your first agent →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity + quick actions */}
      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <h3 className="font-semibold text-white text-sm mb-4">Recent activity</h3>
          {(data?.recentActivity ?? []).length > 0 ? (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {data!.recentActivity.map((event) => {
                const icons: Record<string, typeof MessageSquare> = {
                  query: MessageSquare, document: FileText, conversation: Users,
                };
                const Icon = icons[event.kind] ?? Activity;
                return (
                  <div key={`${event.kind}-${event.created_at}`} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/[0.03] transition-colors">
                    <div className="h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-white/40" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 truncate">{event.title}</p>
                      {event.detail && <p className="text-[11px] text-white/30 truncate">in {event.detail}</p>}
                    </div>
                    <span className="text-[11px] text-white/25 shrink-0">{timeAgo(event.created_at)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10">
              <Activity className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40">Nothing yet — activity will appear here</p>
              <p className="text-xs text-white/25 mt-1">Queries, document uploads and conversations.</p>
            </div>
          )}
        </div>

        {/* Quick actions — "what should I do next?" */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <h3 className="font-semibold text-white text-sm mb-4">Quick actions</h3>
          <div className="space-y-2.5">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <action.icon className="w-4 h-4 text-indigo-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{action.label}</p>
                  <p className="text-[11px] text-white/35">{action.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
          {totals && totals.agents === 0 && (
            <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3.5">
              <p className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Get started
              </p>
              <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
                Create your first agent, upload documents, and your AI assistant goes live in minutes.
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          {error}
          <button onClick={load} className="ml-2 text-rose-300 underline">Retry</button>
        </div>
      )}

      {/* Super-admin context strip */}
      {isAdmin && data && (
        <p className="mt-6 text-xs text-white/25 flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" />
          Platform-admin view · org <span className="font-mono text-white/40">{data.org.slug}</span>
          <Link href="/subscriptions" className="text-indigo-400/70 hover:text-indigo-300 ml-2">Open billing workspace →</Link>
        </p>
      )}
    </div>
  );
}
