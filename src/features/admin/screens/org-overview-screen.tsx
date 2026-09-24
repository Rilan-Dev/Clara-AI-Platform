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
  Activity, AlertTriangle, ArrowUpRight, Building2, ChevronDown, Database, FileText,
  HardDrive, HelpCircle, LayoutDashboard, MessageSquare, Plus, RefreshCw, TrendingUp,
  UserPlus, Users, Zap, ArrowRight, Clock,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { useAuth } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";

type DashboardData = {
  org: { id: string; name: string; slug: string };
  totals: {
    agents: number; knowledgeBases: number; documents: number; members: number;
    storageBytes: number; queriesToday: number; queries7d: number; queries30d: number;
    queriesPrev30d: number; trendPct: number; chatSessions30d: number;
    avgLatencyMs: number | null; activeUsers30d: number;
  };
  // WS-1.6 + WS-1.1: token/cost metering from the usage-event spine,
  // extended with the voice axis (ElevenLabs TTS/STT/conversations).
  usageMetering: {
    chat: { promptTokens: number; completionTokens: number; costUsdMicros: number; requests: number };
    embedding: { promptTokens: number; costUsdMicros: number; batches: number };
    voice: {
      ttsCharacters: number; sttAudioSeconds: number; conversationSeconds: number;
      costUsdMicros: number; ttsRequests: number; sttRequests: number;
      conversationCount: number; latencyP50Ms: number | null; latencyP95Ms: number | null;
    };
    byModel: Array<{ model: string; requests: number; promptTokens: number; completionTokens: number; costUsdMicros: number }>;
  } | null;
  queriesPerDay: { day: string; queries: number }[];
  topQuestions: { query_text: string; count: number }[];
  hourlyDist: { hour: number; count: number }[];
  recentQuestions: {
    id: string; question: string; answer: string | null; status: string;
    surface: string; kb_name: string | null; latency_ms: number | null;
    user_email: string | null; created_at: string;
  }[];
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
  usageLimits: {
    plan_id: string; plan_name: string; status: string; downgraded: boolean;
    usage: {
      kb_count: number; doc_count: number; max_docs_in_kb: number;
      storage_bytes: number;
      requests_today: number; requests_24h: number; api_keys_active: number;
    };
    limits: {
      max_kbs: number; max_docs_per_kb: number; max_req_day: number;
      max_storage_mb: number; voice_enabled: boolean; api_access: boolean;
      custom_branding: boolean; sso_enabled: boolean;
    };
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

// ── Usage & plan limits meter ─────────────────────────────────────────────────

function LimitMeter({ label, used, limit, unit, hint }: {
  label: string; used: number; limit: number; unit?: string; hint?: string;
}) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = !unlimited && used > limit;
  const near = !unlimited && !over && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium whitespace-nowrap ${over ? "text-destructive" : near ? "text-amber-600" : "text-muted-foreground"}`}>
          {used.toLocaleString()}{unit ? ` ${unit}` : ""} / {unlimited ? "Unlimited" : limit.toLocaleString()}{unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            over ? "bg-rose-500" : near ? "bg-amber-400" : "bg-gradient-to-r from-indigo-500 to-violet-500"
          }`}
          style={{ width: over ? "100%" : `${pct}%` }}
        />
      </div>
      {(over || near || hint) && (
        <p className={`text-[11px] mt-1 ${over ? "text-destructive" : near ? "text-amber-600" : "text-muted-foreground/70"}`}>
          {over ? "Over the plan limit — new uploads are blocked until you upgrade" : near ? "Approaching your plan limit — consider upgrading" : hint}
        </p>
      )}
    </div>
  );
}

// ── User question feed (Q&A audit) ───────────────────────────────────────────

const SURFACE_LABELS: Record<string, { label: string; cls: string }> = {
  workspace: { label: "Workspace", cls: "bg-primary/10 text-primary border-primary/25" },
  embed:    { label: "Widget",     cls: "bg-sky-500/10 text-sky-600 border-sky-500/25" },
  voice:    { label: "Voice",      cls: "bg-secondary/10 text-secondary border-secondary/25" },
  search:   { label: "API",        cls: "bg-emerald-500/10 text-emerald-600 border-emerald-600/25" },
};

function QuestionFeedItem({ q }: { q: DashboardData["recentQuestions"][number] }) {
  const [open, setOpen] = useState(false);
  const surface = SURFACE_LABELS[q.surface] ?? { label: q.surface, cls: "bg-muted text-muted-foreground border-border" };
  const hasAnswer = Boolean(q.answer);

  return (
    <div className="rounded-xl border border-border/70 bg-muted/50 px-3.5 py-3">
      <button onClick={() => hasAnswer && setOpen(!open)} className="w-full text-left flex items-start gap-2.5 group">
        <MessageSquare className="w-3.5 h-3.5 text-primary/70 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground/80 line-clamp-2 group-hover:text-foreground transition-colors">{q.question}</p>
          {hasAnswer ? (
            <p className={`text-xs text-muted-foreground/70 mt-1 leading-relaxed ${open ? "" : "line-clamp-1"}`}>
              {open ? q.answer : q.answer!.replace(/\s+/g, " ").slice(0, 160)}{!open && q.answer!.length > 160 ? "…" : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/80 mt-1 italic">
              {q.status === "error" ? "Stream failed — no answer captured" : "Answer pending…"}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[11px] px-1.5 py-0.5 rounded border ${surface.cls}`}>{surface.label}</span>
          <span className="text-[11px] text-muted-foreground/80">{timeAgo(q.created_at)}</span>
        </div>
        {hasAnswer && (
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/80 group-hover:text-muted-foreground transition-all shrink-0 mt-0.5 ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && (
        <div className="mt-2.5 pt-2.5 border-t border-border/70 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
          {q.kb_name && <span>KB: <span className="text-muted-foreground">{q.kb_name}</span></span>}
          {q.user_email && <span>By: <span className="text-muted-foreground">{q.user_email}</span></span>}
          {q.latency_ms != null && <span>Latency: <span className="text-muted-foreground">{q.latency_ms}ms</span></span>}
          <span>Status: <span className={q.status === "ok" ? "text-emerald-600" : q.status === "error" ? "text-destructive" : "text-amber-600"}>{q.status}</span></span>
        </div>
      )}
    </div>
  );
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
      <div className="rounded-2xl border border-emerald-600/20 bg-emerald-500/5 px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-600/30 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{effective.planName}</span> plan active
            {endDate && <> · {effective.daysRemaining !== null && effective.daysRemaining > 0 ? `renews ${endDate}` : `renewed through ${endDate}`}</>}
          </p>
        </div>
        <Link href={renewUrl}>
          <Button variant="outline" size="sm" className="gap-2 border-emerald-600/25 text-emerald-600 hover:bg-emerald-500/10">
            Manage plan <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    );
  }

  // EXPIRED — strongest business injection: renew to restore access.
  if (effective.effectiveStatus === "expired") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Your {effective.planName} subscription has expired</p>
            <p className="text-sm text-muted-foreground mt-0.5">
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
      <div className="rounded-2xl border border-amber-600/30 bg-amber-500/10 px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-600/30 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Renewal due in {effective.daysRemaining} day{effective.daysRemaining === 1 ? "" : "s"}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
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
      <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Trial {effective.daysRemaining !== null && effective.daysRemaining >= 0 ? `ends ${endDate}` : "ended"}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Upgrade to keep your knowledge bases, voice assistant and analytics.</p>
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
    <div className="rounded-2xl border border-secondary/25 bg-secondary/5 px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0">
          <ArrowUpRight className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <p className="font-semibold text-foreground">You&apos;re on the Free plan</p>
          <p className="text-sm text-muted-foreground mt-0.5">
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
    { label: "Queries today",     value: totals?.queriesToday?.toLocaleString() ?? "—",       icon: Activity,     color: "text-primary",     sub: null },
    { label: "Queries · 30 days", value: totals?.queries30d?.toLocaleString() ?? "—",         icon: TrendingUp,   color: "text-secondary",   sub: totals ? `${totals.trendPct >= 0 ? "+" : ""}${totals.trendPct}% vs prev 30d · ${totals.queries7d?.toLocaleString?.() ?? 0} in 7d` : null },
    { label: "Active users · 30d", value: totals?.activeUsers30d?.toLocaleString() ?? "—",    icon: Users,        color: "text-sky-600",      sub: null },
    { label: "Knowledge Bases",   value: totals ? `${totals.knowledgeBases}${maxKbs > 0 ? ` / ${maxKbs === -1 ? "∞" : maxKbs}` : ""}` : "—", icon: Database, color: "text-primary", sub: null },
    { label: "Documents",         value: totals?.documents?.toLocaleString() ?? "—",          icon: FileText,     color: "text-pink-600",     sub: null },
    { label: "Storage used",      value: totals ? formatBytes(totals.storageBytes) : "—",     icon: HardDrive,    color: "text-emerald-600",  sub: null },
    { label: "Team members",      value: totals?.members?.toLocaleString() ?? "—",            icon: Users,        color: "text-amber-600",    sub: null },
  ];

  const quickActions = [
    { href: `/orgs/${id}/agents`,  icon: Plus,      label: "Create an agent",    desc: "Start a new assistant" },
    { href: `/orgs/${id}/members`, icon: UserPlus,  label: "Invite a teammate",  desc: "Grow your team" },
    { href: `/orgs/${id}/billing`, icon: ArrowUpRight, label: "Manage billing",   desc: "Plans, renewal, invoices" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        icon={LayoutDashboard}
        title={data?.org?.name ?? "Dashboard"}
        description={
          isAdmin
            ? "Organisation dashboard — usage, activity and subscription lifecycle."
            : "Your organisation dashboard — usage, activity and what to do next."
        }
        breadcrumbs={isAdmin ? [{ label: "Organisations", href: "/orgs" }, { label: data?.org?.name ?? "…" }] : undefined}
      />

      {/* Smart subscription banner — the single most important business signal */}
      {data?.effective && <SubscriptionBanner effective={data.effective} orgId={id} />}

      {/* KPI cards — mobile: compact 2-col grid, trend subtext stays (it's
          the one number owners care about) but paddings tighten. */}
      <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="border border-border bg-card rounded-2xl p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <div className="text-[11px] sm:text-[11px] text-muted-foreground/70 leading-tight">{kpi.label}</div>
              <kpi.icon className={`w-4 h-4 ${kpi.color} shrink-0`} />
            </div>
            <div className="text-lg sm:text-xl font-black text-foreground">
              {loading ? <div className="h-5 sm:h-6 w-12 bg-muted rounded animate-pulse" /> : kpi.value}
            </div>
            {kpi.sub && (
              <div className={`text-[11px] sm:text-[11px] mt-0.5 sm:mt-1 ${totals && totals.trendPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {kpi.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Usage chart + top KBs */}
      <div className="mt-4 sm:mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground text-sm">Assistant usage</h3>
              <p className="hidden sm:block text-xs text-muted-foreground/70 mt-0.5">
                {totals?.chatSessions30d ?? 0} conversations · {totals?.queries30d?.toLocaleString() ?? 0} queries
                {totals?.avgLatencyMs ? ` · ~${totals.avgLatencyMs}ms avg response` : ""}
              </p>
              {/* WS-1.6 + WS-1.1: metering parity — tokens + estimated cost. */}
              {data?.usageMetering && (data.usageMetering.chat.promptTokens > 0 || data.usageMetering.embedding.promptTokens > 0) && (
                <p className="hidden sm:block text-xs text-muted-foreground/80 mt-0.5">
                  AI usage · 30d: {((data.usageMetering.chat.promptTokens + data.usageMetering.embedding.promptTokens) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k tokens
                  {` · ~$${((data.usageMetering.chat.costUsdMicros + data.usageMetering.embedding.costUsdMicros) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} est. cost`}
                </p>
              )}
              {/* Voice axis (ElevenLabs): TTS/STT/conversation metering + latency. */}
              {data?.usageMetering && data.usageMetering.voice && (data.usageMetering.voice.ttsRequests > 0 || data.usageMetering.voice.sttRequests > 0 || data.usageMetering.voice.conversationCount > 0) && (
                <p className="hidden sm:block text-xs text-muted-foreground/80 mt-0.5">
                  Voice · 30d: {data.usageMetering.voice.ttsCharacters.toLocaleString()} spoken chars
                  {` · ${Math.round(data.usageMetering.voice.sttAudioSeconds / 60).toLocaleString()} min transcribed`}
                  {data.usageMetering.voice.conversationCount > 0 ? ` · ${Math.round(data.usageMetering.voice.conversationSeconds / 60).toLocaleString()} min conversations` : ""}
                  {` · ~$${(data.usageMetering.voice.costUsdMicros / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} est.`}
                  {data.usageMetering.voice.latencyP95Ms != null ? ` · p95 ${data.usageMetering.voice.latencyP95Ms}ms` : ""}
                </p>
              )}
            </div>
            <button onClick={load} aria-label="Refresh usage" className="text-muted-foreground/70 hover:text-muted-foreground active:text-foreground transition-colors shrink-0">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {/* Shorter chart on phones so the page stays scannable */}
          <div className="h-36 sm:h-56">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#818cf8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#e2e8f0" }} tickLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff", border: "1px solid #e2e8f0",
                      borderRadius: 12, fontSize: 12, color: "#1e293b",
                    }}
                    labelStyle={{ color: "#64748b" }}
                    formatter={(v) => [v, "Queries"]} />
                  <Area type="monotone" dataKey="queries" stroke="#818cf8" strokeWidth={2}
                    fill="url(#usageGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/80 mb-3" />
                <p className="text-sm text-muted-foreground/70">No usage yet</p>
                <p className="text-xs text-muted-foreground/80 mt-1">Chat with your assistant or embed the widget to see activity here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Top knowledge bases */}
        <div className="border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm mb-4">Busiest knowledge bases</h3>
          {(data?.topKnowledgeBases ?? []).length > 0 ? (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {data!.topKnowledgeBases.map((kb) => (
                <Link key={kb.kb_id} href={`/orgs/${id}/agents/${kb.agent_id}`}
                  className="block rounded-xl border border-border/70 bg-muted/50 px-3.5 py-2.5 hover:bg-muted hover:border-primary/25 transition-all group">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{kb.kb_name}</p>
                      <p className="text-[11px] text-muted-foreground/70 truncate">{kb.agent_name} · {kb.doc_count} docs</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-primary">{kb.queries_30d}</div>
                      <div className="text-[11px] text-muted-foreground/80">queries</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Database className="w-8 h-8 text-muted-foreground/80 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/70">No knowledge bases yet</p>
              <Link href={`/orgs/${id}/agents`} className="text-xs text-primary hover:text-primary/80 mt-2 inline-block">
                Create your first agent →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* User questions (Q&A audit feed) + plan usage / top questions */}
      <div className="mt-4 sm:mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground text-sm">User questions</h3>
              <p className="hidden sm:block text-xs text-muted-foreground/70 mt-0.5">
                Every question asked — workspace, widget and voice — with the AI answer
              </p>
            </div>
            <button onClick={load} aria-label="Refresh questions" className="text-muted-foreground/70 hover:text-muted-foreground active:text-foreground transition-colors shrink-0">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {(data?.recentQuestions ?? []).length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {data!.recentQuestions.map((q) => (
                <QuestionFeedItem key={q.id} q={q} />
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <HelpCircle className="w-8 h-8 text-muted-foreground/80 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/70">No questions yet</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                When you or your visitors ask the assistant, the question and its answer appear here.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Plan usage & limits — monitoring */}
          <div className="border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-semibold text-foreground text-sm">Plan usage</h3>
              {data?.usageLimits && (
                <Link href={`/orgs/${id}/billing`} className="text-[11px] text-primary hover:text-primary/80 shrink-0">
                  Manage plan →
                </Link>
              )}
            </div>
            {data?.usageLimits ? (
              <div className="space-y-3.5">
                <LimitMeter
                  label="Requests today"
                  used={data.usageLimits.usage.requests_today}
                  limit={data.usageLimits.limits.max_req_day}
                />
                <LimitMeter
                  label="Knowledge bases"
                  used={data.usageLimits.usage.kb_count}
                  limit={data.usageLimits.limits.max_kbs}
                />
                <LimitMeter
                  label="Storage"
                  used={Math.round(data.usageLimits.usage.storage_bytes / 1024 / 1024 * 10) / 10}
                  limit={data.usageLimits.limits.max_storage_mb}
                  unit="MB"
                />
                <LimitMeter
                  label="Docs per KB (max)"
                  used={data.usageLimits.usage.max_docs_in_kb}
                  limit={data.usageLimits.limits.max_docs_per_kb}
                />
                {data.usageLimits.downgraded && (
                  <p className="text-[11px] text-amber-600 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Subscription not active — free-plan limits are being enforced
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground/70">Usage data unavailable</p>
                <button onClick={load} className="text-xs text-primary hover:text-primary/80 mt-2">Retry</button>
              </div>
            )}
          </div>

          {/* Top questions */}
          <div className="border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
            <h3 className="font-semibold text-foreground text-sm mb-4">Top questions · 30 days</h3>
            {(data?.topQuestions ?? []).length > 0 ? (
              <ol className="space-y-2">
                {data!.topQuestions.map((tq, i) => (
                  <li key={`${tq.query_text.slice(0, 40)}-${i}`} className="flex items-start gap-2.5 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                    <span className="text-[11px] font-bold text-primary/70 bg-primary/10 border border-primary/20 rounded-md w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-foreground/80 leading-snug line-clamp-2 min-w-0 flex-1">{tq.query_text}</p>
                    <span className="text-[11px] text-muted-foreground/70 shrink-0 mt-0.5">{tq.count}×</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="w-7 h-7 text-muted-foreground/80 mx-auto mb-2.5" />
                <p className="text-sm text-muted-foreground/70">No questions in the last 30 days</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity + quick actions */}
      <div className="mt-4 sm:mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm mb-4">Recent activity</h3>
          {(data?.recentActivity ?? []).length > 0 ? (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {data!.recentActivity.map((event) => {
                const icons: Record<string, typeof MessageSquare> = {
                  query: MessageSquare, document: FileText, conversation: Users,
                };
                const Icon = icons[event.kind] ?? Activity;
                return (
                  <div key={`${event.kind}-${event.created_at}`} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
                    <div className="h-7 w-7 rounded-lg bg-muted border border-border/70 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground/80 truncate">{event.title}</p>
                      {event.detail && <p className="text-[11px] text-muted-foreground/70 truncate">in {event.detail}</p>}
                    </div>
                    <span className="text-[11px] text-muted-foreground/80 shrink-0">{timeAgo(event.created_at)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10">
              <Activity className="w-8 h-8 text-muted-foreground/80 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/70">Nothing yet — activity will appear here</p>
              <p className="text-xs text-muted-foreground/80 mt-1">Queries, document uploads and conversations.</p>
            </div>
          )}
        </div>

        {/* Quick actions — "what should I do next?" */}
        <div className="border border-border bg-card rounded-2xl p-4 sm:p-5 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm mb-4">Quick actions</h3>
          <div className="space-y-2.5">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/50 px-4 py-3 hover:bg-primary/10 hover:border-primary/30 transition-all group">
                <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <action.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground/70">{action.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/80 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
          {totals && totals.agents === 0 && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Get started
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Create your first agent, upload documents, and your AI assistant goes live in minutes.
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
          {error}
          <button onClick={load} className="ml-2 text-destructive underline">Retry</button>
        </div>
      )}

      {/* Super-admin context strip */}
      {isAdmin && data && (
        <p className="mt-6 text-xs text-muted-foreground/80 flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" />
          Platform-admin view · org <span className="font-mono text-muted-foreground/70">{data.org.slug}</span>
          <Link href="/subscriptions" className="text-primary/70 hover:text-primary ml-2">Open billing workspace →</Link>
        </p>
      )}
    </div>
  );
}
