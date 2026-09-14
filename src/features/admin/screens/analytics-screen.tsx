"use client";
/**
 * Analytics Screen — Phase 5
 * Real data from /api/analytics/queries, /api/analytics/revenue,
 * /api/analytics/usage, /api/health
 * Interactive Recharts charts + date range filtering + top queries.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, TrendingUp, MessageSquare, Clock,
  BarChart3, Database, RefreshCw, Zap,
  Server, Cpu, Globe, Users,
  CheckCircle2, AlertCircle, ArrowUpRight, FileSearch, Search,
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

// ── Types ─────────────────────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d" | "180d";

type QueryAnalytics = {
  timeSeries:  { bucket: string; count: number; avg_latency: number | null }[];
  topQueries:  { query_text: string; count: number; avg_latency: number | null; orgs: number }[];
  hourlyDist:  { hour: number; count: number }[];
  totals:      { total_queries: number; unique_queries: number; avg_latency: number | null; active_kbs: number };
};

type RevenueAnalytics = {
  mrrTrend:        { month: string; month_ts: string; new_subs: number; added_mrr: number; active_subs: number }[];
  planDist:        { plan_id: string; plan_name: string; count: number; mrr: number }[];
  billingTimeline: { day: string; total_usd: number; event_count: number; gateway: string }[];
  totals:          { mrr: number; arr: number; paying_orgs: number; trial_orgs: number };
};

type UsageAnalytics = {
  orgUsage: {
    org_id: string; org_name: string; org_slug: string;
    plan_id: string; plan_name: string;
    kb_count: number; doc_count: number; storage_bytes: number;
    query_count: number; avg_latency: number | null; user_count: number;
  }[];
  topKbs: { kb_id: string; kb_name: string; org_name: string; query_count: number; avg_latency: number | null; doc_count: number }[];
  summary: { total_orgs: number; total_kbs: number; total_docs: number; total_queries: number; total_users: number; total_storage: number };
};

type HealthData = {
  status: "healthy" | "degraded";
  uptime: { seconds: number; human: string };
  checks: {
    database: { status: string; latencyMs: number; pool: { total: number | null; idle: number | null; waiting: number | null } };
    qdrant:   { status: string; latencyMs: number; url: string | null };
  };
  memory: { heapUsedMb: number; heapTotalMb: number; rssMb: number };
  responseMs: number;
};

type AuditRow = {
  id: string; org_id: string | null; org_name: string | null;
  kb_id: string; kb_name: string | null; user_email: string | null;
  question: string; answer: string | null; surface: string; status: string;
  latency_ms: number | null; created_at: string;
};

type AuditData = {
  rows: AuditRow[];
  total: number;
  hasMore: boolean;
  orgs: { id: string; name: string }[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

const RANGE_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180 };
const RANGE_LABELS: Record<DateRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "180d": "6 months" };

const AUDIT_PAGE_SIZE = 50;

const SURFACE_BADGES: Record<string, { label: string; cls: string }> = {
  workspace: { label: "Workspace", cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/25" },
  embed:    { label: "Widget",     cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" },
  voice:    { label: "Voice",      cls: "bg-violet-500/15 text-violet-300 border-violet-500/25" },
  search:   { label: "API",        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
};

function rangeParams(range: DateRange) {
  const to   = new Date();
  const from = new Date(Date.now() - RANGE_DAYS[range] * 86400 * 1000);
  return `from=${from.toISOString()}&to=${to.toISOString()}`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const PLAN_COLOR: Record<string, string> = {
  free:       "#64748b",
  starter:    "#06b6d4",
  pro:        "#6366f1",
  enterprise: "#f59e0b",
};

const CHART_COLORS = {
  primary:   "#6366f1",
  secondary: "#06b6d4",
  success:   "#10b981",
  warning:   "#f59e0b",
  danger:    "#f43f5e",
  grid:      "rgba(255,255,255,0.05)",
  text:      "rgba(255,255,255,0.4)",
};

const tooltipStyle = {
  backgroundColor: "#111118",
  border:          "1px solid rgba(255,255,255,0.1)",
  borderRadius:    "10px",
  color:           "#fff",
  fontSize:        "12px",
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const [range,   setRange]   = useState<DateRange>("30d");
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"queries" | "revenue" | "usage" | "audit">("queries");

  const [queryData,   setQueryData]   = useState<QueryAnalytics | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueAnalytics | null>(null);
  const [usageData,   setUsageData]   = useState<UsageAnalytics | null>(null);
  const [health,      setHealth]      = useState<HealthData | null>(null);

  // Query-audit state (platform admin compliance view)
  const [auditData,     setAuditData]     = useState<AuditData | null>(null);
  const [auditLoading,  setAuditLoading]  = useState(false);
  const [auditOrg,      setAuditOrg]      = useState("");
  const [auditSearch,   setAuditSearch]   = useState("");
  const [auditDebounced, setAuditDebounced] = useState("");
  const [expandedRow,   setExpandedRow]   = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setAuditDebounced(auditSearch), 350);
    return () => clearTimeout(t);
  }, [auditSearch]);

  const loadAudit = useCallback(async (opts: { offset?: number; append?: boolean } = {}) => {
    setAuditLoading(true);
    try {
      const offset = opts.offset ?? 0;
      const to   = new Date();
      const from = new Date(Date.now() - RANGE_DAYS[range] * 86400 * 1000);
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: String(AUDIT_PAGE_SIZE), offset: String(offset) });
      if (auditOrg)    params.set("orgId", auditOrg);
      if (auditDebounced) params.set("q", auditDebounced);
      const res  = await fetch(apiUrl(`/api/analytics/audit?${params.toString()}`), { headers: withAuthHeaders({}) });
      const data = await res.json().catch(() => null);
      if (data && !data.error) {
        setAuditData(prev => opts.append && prev ? { ...data, rows: [...prev.rows, ...data.rows] } : data);
      } else if (!opts.append) {
        setAuditData(null);
      }
    } finally {
      setAuditLoading(false);
    }
  }, [range, auditOrg, auditDebounced]);

  // Load / reload the audit feed when the audit tab is active or filters change.
  useEffect(() => {
    if (tab === "audit") loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, auditOrg, auditDebounced]);

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    const params = rangeParams(r);
    const gran   = r === "7d" ? "day" : r === "30d" ? "day" : r === "90d" ? "week" : "month";
    try {
      const [qRes, revRes, usRes, hlRes] = await Promise.all([
        fetch(apiUrl(`/api/analytics/queries?${params}&granularity=${gran}`), { headers: withAuthHeaders({}) }).then(x => x.json()).catch(() => null),
        fetch(apiUrl(`/api/analytics/revenue?${params}`),                     { headers: withAuthHeaders({}) }).then(x => x.json()).catch(() => null),
        fetch(apiUrl(`/api/analytics/usage?${params}`),                       { headers: withAuthHeaders({}) }).then(x => x.json()).catch(() => null),
        fetch(apiUrl("/api/health")).then(x => x.json()).catch(() => null),
      ]);
      setQueryData(qRes);
      setRevenueData(revRes);
      setUsageData(usRes);
      setHealth(hlRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  const qt = queryData?.totals;
  const rt = revenueData?.totals;
  const ut = usageData?.summary;

  const kpiCards = [
    { label: "Total Queries",   value: qt?.total_queries?.toLocaleString()  ?? "—", sub: RANGE_LABELS[range],              icon: MessageSquare, color: "text-violet-400" },
    { label: "Unique Queries",  value: qt?.unique_queries?.toLocaleString() ?? "—", sub: "Distinct question patterns",      icon: Zap,           color: "text-cyan-400"   },
    { label: "Avg Latency",     value: qt?.avg_latency ? `${qt.avg_latency}ms` : "—", sub: "End-to-end RAG response",      icon: Clock,         color: "text-amber-400"  },
    { label: "Active KBs",      value: qt?.active_kbs?.toLocaleString()     ?? "—", sub: "Received at least 1 query",      icon: Database,      color: "text-indigo-400" },
    { label: "MRR",             value: rt?.mrr ? `$${rt.mrr.toLocaleString()}` : "—", sub: `${rt?.paying_orgs ?? 0} paying orgs`, icon: TrendingUp, color: "text-emerald-400" },
    { label: "Total Orgs",      value: ut?.total_orgs?.toLocaleString()     ?? "—", sub: `${ut?.total_users ?? 0} users`,  icon: Users,         color: "text-rose-400"   },
    { label: "Documents",       value: ut?.total_docs?.toLocaleString()     ?? "—", sub: fmtBytes(ut?.total_storage ?? 0), icon: Globe,         color: "text-orange-400" },
    { label: "Knowledge Bases", value: ut?.total_kbs?.toLocaleString()      ?? "—", sub: "Active across all orgs",          icon: BarChart3,     color: "text-pink-400"   },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">

      {/* ── Header — mobile: title row + controls wrap to their own row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white">Platform Analytics</h1>
          <p className="hidden sm:block text-white/40 text-sm mt-0.5">Real-time metrics across all organisations</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex gap-1 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1">
            {(["7d","30d","90d","180d"] as DateRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`text-xs px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-all ${range === r ? "bg-indigo-600 text-white" : "text-white/40 hover:text-white"}`}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={() => load(range)}
            aria-label="Refresh analytics"
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map(c => (
          <div key={c.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-xl font-black text-white mb-0.5">
              {loading ? <div className="h-6 w-16 bg-white/[0.06] rounded animate-pulse" /> : c.value}
            </div>
            <div className="text-xs text-white/25">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Health Panel ── */}
      {health && (
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-400" /> Platform Health
            </h3>
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${health.status === "healthy" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
              {health.status === "healthy" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {health.status === "healthy" ? "All systems operational" : "Degraded"}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Uptime",     value: health.uptime.human,                 icon: Activity,  color: "text-emerald-400" },
              { label: "DB latency", value: `${health.checks.database.latencyMs}ms`, icon: Database, color: health.checks.database.status === "ok" ? "text-emerald-400" : "text-rose-400" },
              { label: "Qdrant",     value: health.checks.qdrant.status === "unconfigured" ? "n/a" : `${health.checks.qdrant.latencyMs}ms`, icon: Zap, color: "text-cyan-400" },
              { label: "Heap used",  value: `${health.memory.heapUsedMb} MB`,    icon: Cpu,       color: "text-violet-400" },
              { label: "API resp.",  value: `${health.responseMs}ms`,             icon: Clock,     color: "text-amber-400" },
            ].map(h => (
              <div key={h.label} className="bg-white/[0.03] rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <h.icon className={`w-3.5 h-3.5 ${h.color}`} />
                  <span className="text-xs text-white/40">{h.label}</span>
                </div>
                <div className={`text-sm font-bold ${h.color}`}>{h.value}</div>
              </div>
            ))}
          </div>
          {health.checks.database.pool.total !== null && (
            <div className="mt-3 flex gap-4 text-xs text-white/30">
              <span>DB pool — Total: <span className="text-white/60">{health.checks.database.pool.total}</span></span>
              <span>Idle: <span className="text-white/60">{health.checks.database.pool.idle}</span></span>
              <span>Waiting: <span className="text-white/60">{health.checks.database.pool.waiting}</span></span>
              {health.checks.qdrant.url && <span>Qdrant: <span className="text-white/60 font-mono">{health.checks.qdrant.url}</span></span>}
            </div>
          )}
        </div>
      )}

      {/* ── Tab bar — scrollable chips on mobile (app-style segmented control) ── */}
      <div className="flex gap-1 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none rail-fade-r sm:[mask-image:none] sm:[-webkit-mask-image:none] border-b border-white/[0.06]">
        {([
          { id: "queries", label: "Query Analytics", icon: MessageSquare },
          { id: "revenue", label: "Revenue",         icon: TrendingUp    },
          { id: "usage",   label: "Usage Breakdown", icon: BarChart3     },
          { id: "audit",   label: "Query Audit",     icon: FileSearch    },
        ] as { id: typeof tab; label: string; icon: React.ElementType }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 border-b-2 transition-all -mb-px whitespace-nowrap ${tab === t.id ? "border-indigo-500 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ════════ TAB: QUERIES ════════ */}
      {tab === "queries" && (
        <div className="space-y-6">

          {/* Query volume area chart */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
            <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-400" /> Query Volume Over Time
            </h3>
            {loading || !queryData?.timeSeries.length ? (
              <div className="h-52 flex items-center justify-center text-white/20 text-sm">
                {loading ? "Loading chart…" : "No data for this period"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={queryData.timeSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="bucket" tickFormatter={fmtDate} tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDate} />
                  <Area type="monotone" dataKey="count" name="Queries" stroke={CHART_COLORS.primary} fill="url(#qGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">

            {/* Top Queries */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" /> Top Queries
                </h3>
                <span className="text-xs text-white/30">by frequency</span>
              </div>
              {loading ? (
                <div className="p-5 space-y-3">{Array(5).fill(0).map((_,i) => <div key={i} className="h-10 bg-white/[0.04] rounded animate-pulse" />)}</div>
              ) : !queryData?.topQueries.length ? (
                <div className="px-5 py-12 text-center text-white/25 text-sm">No queries in this period</div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {queryData.topQueries.map((q, i) => {
                    const pct = Math.round((q.count / (queryData.topQueries[0]?.count ?? 1)) * 100);
                    return (
                      <div key={i} className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <span className="text-sm text-white/80 truncate flex-1">&quot;{q.query_text}&quot;</span>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-indigo-400">{q.count}</span>
                            {q.avg_latency && <span className="text-xs text-white/25 ml-2">{q.avg_latency}ms</span>}
                          </div>
                        </div>
                        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500/50 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        {q.orgs > 1 && <span className="text-xs text-white/25">{q.orgs} orgs</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hourly distribution */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
              <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Hourly Activity Pattern
              </h3>
              {loading || !queryData?.hourlyDist.length ? (
                <div className="h-52 flex items-center justify-center text-white/20 text-sm">{loading ? "Loading…" : "No data"}</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={queryData.hourlyDist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}:00`} tick={{ fill: CHART_COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(h: number) => `${h}:00`} />
                    <Bar dataKey="count" name="Queries" fill={CHART_COLORS.secondary} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ TAB: REVENUE ════════ */}
      {tab === "revenue" && (
        <div className="space-y-6">

          {/* Revenue KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "MRR",         value: `$${(rt?.mrr         ?? 0).toLocaleString()}`, color: "text-emerald-400" },
              { label: "ARR (est.)",  value: `$${(rt?.arr         ?? 0).toLocaleString()}`, color: "text-indigo-400" },
              { label: "Paying orgs", value: (rt?.paying_orgs ?? 0).toString(),              color: "text-cyan-400"   },
              { label: "Trial orgs",  value: (rt?.trial_orgs  ?? 0).toString(),              color: "text-amber-400"  },
            ].map(c => (
              <div key={c.label} className="border border-white/[0.08] bg-white/[0.03] rounded-xl p-4">
                <div className="text-xs text-white/40 mb-2">{c.label}</div>
                <div className={`text-xl sm:text-2xl font-black ${c.color}`}>
                  {loading ? <div className="h-7 w-20 bg-white/[0.06] rounded animate-pulse" /> : c.value}
                </div>
              </div>
            ))}
          </div>

          {/* MRR trend */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
            <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> MRR Trend
            </h3>
            {loading || !revenueData?.mrrTrend.length ? (
              <div className="h-52 flex items-center justify-center text-white/20 text-sm">{loading ? "Loading…" : "No revenue data"}</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueData.mrrTrend} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, ""]} />
                  <Legend wrapperStyle={{ color: CHART_COLORS.text, fontSize: 12 }} />
                  <Line type="monotone" dataKey="added_mrr"   name="New MRR"     stroke={CHART_COLORS.success}   strokeWidth={2} dot={{ fill: CHART_COLORS.success,   r: 3 }} />
                  <Line type="monotone" dataKey="active_subs" name="Active subs" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ fill: CHART_COLORS.secondary, r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">

            {/* Plan distribution */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
              <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" /> Plan Distribution
              </h3>
              {loading ? (
                <div className="space-y-3">{Array(4).fill(0).map((_,i) => <div key={i} className="h-8 bg-white/[0.04] rounded animate-pulse" />)}</div>
              ) : (
                <div className="space-y-3">
                  {(revenueData?.planDist ?? []).map(p => {
                    const total = (revenueData?.planDist ?? []).reduce((s, x) => s + x.count, 0) || 1;
                    const pct   = Math.round((p.count / total) * 100);
                    return (
                      <div key={p.plan_id}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-white/70 font-medium capitalize">{p.plan_name}</span>
                          <span className="text-white/40">{p.count} orgs · {pct}%{p.mrr > 0 ? ` · $${p.mrr.toLocaleString()}/mo` : ""}</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PLAN_COLOR[p.plan_id] ?? "#6366f1" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Billing events */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
              <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-cyan-400" /> Payment Events
              </h3>
              {loading || !revenueData?.billingTimeline.length ? (
                <div className="h-44 flex items-center justify-center text-white/20 text-sm">{loading ? "Loading…" : "No payment events in period"}</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={revenueData.billingTimeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                    <XAxis dataKey="day" tickFormatter={fmtDate} tick={{ fill: CHART_COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "Revenue"]} labelFormatter={fmtDate} />
                    <Bar dataKey="total_usd" name="USD" fill={CHART_COLORS.success} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ TAB: USAGE ════════ */}
      {tab === "usage" && (
        <div className="space-y-6">

          {/* Top KBs */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
            <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" /> Top Knowledge Bases
            </h3>
            {loading ? (
              <div className="space-y-2">{Array(4).fill(0).map((_,i) => <div key={i} className="h-10 bg-white/[0.04] rounded animate-pulse" />)}</div>
            ) : !usageData?.topKbs.length ? (
              <div className="py-8 text-center text-white/25 text-sm">No KB activity in this period</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {usageData.topKbs.map(kb => {
                  const pct = Math.round((kb.query_count / (usageData.topKbs[0]?.query_count ?? 1)) * 100);
                  return (
                    <div key={kb.kb_id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-sm font-medium text-white">{kb.kb_name}</div>
                          <div className="text-xs text-white/30">{kb.org_name} · {kb.doc_count} docs</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-indigo-400">{kb.query_count.toLocaleString()}</div>
                          {kb.avg_latency && <div className="text-xs text-white/25">{kb.avg_latency}ms avg</div>}
                        </div>
                      </div>
                      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500/40 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-org usage — desktop table, mobile cards */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-violet-400" /> Organisation Usage
              </h3>
              <span className="text-xs text-white/30 shrink-0">{RANGE_LABELS[range]}</span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/[0.03]">
                  <tr className="text-xs text-white/40 text-left">
                    {["Organisation","Plan","KBs","Docs","Storage","Queries","Avg Latency","Users"].map(h => (
                      <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {loading
                    ? Array(5).fill(0).map((_,i) => (
                        <tr key={i}>
                          {Array(8).fill(0).map((_,j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-white/[0.04] rounded animate-pulse" /></td>)}
                        </tr>
                      ))
                    : (usageData?.orgUsage ?? []).map(org => (
                        <tr key={org.org_id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-white">{org.org_name}</div>
                            <div className="text-xs text-white/25 font-mono">{org.org_slug}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                              style={{ backgroundColor: `${PLAN_COLOR[org.plan_id] ?? "#6366f1"}20`, color: PLAN_COLOR[org.plan_id] ?? "#6366f1" }}>
                              {org.plan_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/60">{org.kb_count}</td>
                          <td className="px-4 py-3 text-sm text-white/60">{org.doc_count}</td>
                          <td className="px-4 py-3 text-sm text-white/60">{fmtBytes(org.storage_bytes)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-indigo-400">{org.query_count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-white/40">{org.avg_latency ? `${org.avg_latency}ms` : "—"}</td>
                          <td className="px-4 py-3 text-sm text-white/60">{org.user_count}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {!loading && !usageData?.orgUsage.length && (
                <div className="px-5 py-12 text-center text-white/25 text-sm">No usage data found</div>
              )}
            </div>

            {/* Mobile org usage cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {loading
                ? Array(4).fill(0).map((_, i) => (
                    <div key={i} className="px-4 py-4 space-y-2">
                      <div className="h-4 w-1/2 bg-white/[0.04] rounded animate-pulse" />
                      <div className="h-3 w-2/3 bg-white/[0.04] rounded animate-pulse" />
                    </div>
                  ))
                : (usageData?.orgUsage ?? []).map(org => (
                    <div key={org.org_id} className="px-4 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{org.org_name}</p>
                          <p className="text-[11px] text-white/25 font-mono truncate">{org.org_slug}</p>
                        </div>
                        <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium capitalize"
                          style={{ backgroundColor: `${PLAN_COLOR[org.plan_id] ?? "#6366f1"}20`, color: PLAN_COLOR[org.plan_id] ?? "#6366f1" }}>
                          {org.plan_name}
                        </span>
                      </div>
                      {/* Compact 2-row metric grid instead of 8 columns */}
                      <div className="mt-2.5 grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {[
                          ["KBs", org.kb_count],
                          ["Docs", org.doc_count],
                          ["Queries", org.query_count.toLocaleString()],
                          ["Users", org.user_count],
                          ["Storage", fmtBytes(org.storage_bytes)],
                          ["Latency", org.avg_latency ? `${org.avg_latency}ms` : "—"],
                        ].map(([label, value]) => (
                          <div key={label as string} className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
                            <div className="text-[13px] font-semibold text-white truncate">{value}</div>
                            <div className="text-[10px] text-white/30">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              {!loading && !usageData?.orgUsage.length && (
                <div className="px-5 py-12 text-center text-white/25 text-sm">No usage data found</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ TAB: QUERY AUDIT (prompts + AI answers) ════════ */}
      {tab === "audit" && (
        <div className="space-y-4">

          {/* Filter bar — org filter + free-text search */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search questions, answers, knowledge bases…"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-500/40 transition-colors"
              />
            </div>
            <select
              value={auditOrg}
              onChange={(e) => setAuditOrg(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/40 transition-colors max-w-full sm:w-56"
            >
              <option value="">All organisations</option>
              {(auditData?.orgs ?? []).map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button
              onClick={() => loadAudit()}
              aria-label="Refresh audit feed"
              className="flex items-center justify-center gap-2 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-xl transition-all shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {/* Audit list */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-rose-400" /> Prompts &amp; AI Answers
              </h3>
              <span className="text-xs text-white/30 shrink-0">
                {auditData ? `${auditData.total.toLocaleString()} total · ${RANGE_LABELS[range]}` : ""}
              </span>
            </div>

            {auditLoading && !auditData ? (
              <div className="p-5 space-y-3">
                {Array(6).fill(0).map((_, i) => <div key={i} className="h-16 bg-white/[0.04] rounded-xl animate-pulse" />)}
              </div>
            ) : !auditData?.rows.length ? (
              <div className="px-5 py-16 text-center">
                <FileSearch className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No logged conversations in this period</p>
                <p className="text-xs text-white/20 mt-1">
                  Every workspace, widget and voice question is recorded here with its answer.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {auditData.rows.map(row => {
                  const surface = SURFACE_BADGES[row.surface] ?? { label: row.surface, cls: "bg-white/10 text-white/50 border-white/15" };
                  const open = expandedRow === row.id;
                  return (
                    <div key={row.id} className="px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors">
                      <button
                        onClick={() => setExpandedRow(open ? null : row.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {/* Question */}
                            <p className="text-sm text-white/85 leading-snug">
                              <span className="text-white/30 mr-1.5 font-medium">Q:</span>
                              {row.question}
                            </p>
                            {/* Answer preview */}
                            <p className={`text-[13px] text-white/45 mt-1 leading-relaxed ${open ? "" : "line-clamp-1"}`}>
                              <span className="text-white/30 mr-1.5 font-medium">A:</span>
                              {row.answer
                                ? (open ? row.answer : row.answer.replace(/\s+/g, " ").slice(0, 200) + (row.answer.length > 200 ? "…" : ""))
                                : <span className="italic">{row.status === "error" ? "Stream failed — no answer captured" : "Answer pending…"}</span>}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${surface.cls}`}>{surface.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                row.status === "ok" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : row.status === "error" ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-amber-500/10 text-amber-300 border-amber-500/20"}`}>
                                {row.status}
                              </span>
                            </div>
                            <span className="text-[10px] text-white/25">
                              {new Date(row.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </button>
                      {open && (
                        <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/35">
                          <span>Org: <span className="text-white/60">{row.org_name ?? "—"}</span></span>
                          <span>KB: <span className="text-white/60">{row.kb_name ?? "—"}</span></span>
                          <span>User: <span className="text-white/60">{row.user_email ?? "anonymous visitor"}</span></span>
                          {row.latency_ms != null && <span>Latency: <span className="text-white/60">{row.latency_ms}ms</span></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Load more */}
            {auditData?.hasMore && (
              <div className="px-5 py-4 border-t border-white/[0.06] flex justify-center">
                <button
                  onClick={() => loadAudit({ offset: auditData.rows.length, append: true })}
                  disabled={auditLoading}
                  className="text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/25 px-4 py-2 rounded-lg transition-all disabled:opacity-50"
                >
                  {auditLoading ? "Loading…" : `Load more (${(auditData.total - auditData.rows.length).toLocaleString()} remaining)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
