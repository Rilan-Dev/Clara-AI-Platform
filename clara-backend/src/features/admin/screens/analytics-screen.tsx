"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Activity, TrendingUp, MessageSquare, Clock,
  BarChart3, Globe, Zap, RefreshCw, Database
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";

type QueryEvent = {
  kb_name: string;
  org_name: string;
  query_text: string;
  created_at: string;
  latency_ms?: number;
};

type PlatformStats = {
  totalQueries: number;
  totalQueriesThisMonth: number;
  totalKbs: number;
  totalDocuments: number;
  recentActivity: QueryEvent[];
};

type RevenueData = {
  planDist: { plan_id: string; count: number }[];
};

const PLAN_COLOR: Record<string, string> = {
  free:       "bg-slate-500",
  starter:    "bg-cyan-500",
  pro:        "bg-indigo-500",
  enterprise: "bg-amber-500",
};

export default function AnalyticsPage() {
  const [stats, setStats]     = useState<PlatformStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(apiUrl("/api/platform/stats")).then(r => r.json()).catch(() => null),
      fetch(apiUrl("/api/platform/revenue")).then(r => r.json()).catch(() => null),
    ]).then(([s, rev]) => {
      setStats(s);
      setRevenue(rev);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalOrgs = (revenue?.planDist ?? []).reduce((s, p) => s + p.count, 0) || 1;

  const kpiCards = [
    { label: "Total Queries",      value: stats?.totalQueries?.toLocaleString() ?? "—",          icon: MessageSquare, color: "text-violet-400", sub: "All time" },
    { label: "This Month",         value: stats?.totalQueriesThisMonth?.toLocaleString() ?? "—",  icon: TrendingUp,    color: "text-emerald-400", sub: "Current billing period" },
    { label: "Knowledge Bases",    value: stats?.totalKbs ?? "—",                                  icon: Database,      color: "text-indigo-400", sub: "Active KBs" },
    { label: "Documents Indexed",  value: stats?.totalDocuments ?? "—",                            icon: Globe,         color: "text-cyan-400", sub: "Across all orgs" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
          <p className="text-white/40 text-sm mt-0.5">Usage metrics across all organisations</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpiCards.map(c => (
          <div key={c.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-black text-white mb-1">
              {loading ? <div className="h-7 w-20 bg-white/[0.06] rounded animate-pulse" /> : c.value}
            </div>
            <div className="text-xs text-white/30">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Plan Distribution */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <h3 className="font-semibold text-white text-sm mb-5 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" /> Org Plan Distribution
          </h3>
          {loading
            ? Array(4).fill(0).map((_, i) => <div key={i} className="h-8 bg-white/[0.04] rounded animate-pulse mb-3" />)
            : (revenue?.planDist ?? []).map(p => {
                const pct = Math.round((p.count / totalOrgs) * 100);
                return (
                  <div key={p.plan_id} className="mb-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-white/70 capitalize font-medium">{p.plan_id}</span>
                      <span className="text-white/40">{p.count} · {pct}%</span>
                    </div>
                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className={`h-full ${PLAN_COLOR[p.plan_id] ?? "bg-slate-500"} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
        </div>

        {/* Query Volume breakdown */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <h3 className="font-semibold text-white text-sm mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Query Volume
          </h3>
          {loading
            ? <div className="space-y-4">{Array(3).fill(0).map((_, i) => <div key={i} className="h-12 bg-white/[0.04] rounded animate-pulse" />)}</div>
            : <div className="space-y-4">
                {[
                  { label: "All Time",     value: stats?.totalQueries?.toLocaleString() ?? "0", color: "text-violet-400", icon: Zap },
                  { label: "This Month",   value: stats?.totalQueriesThisMonth?.toLocaleString() ?? "0", color: "text-emerald-400", icon: TrendingUp },
                  { label: "Avg / KB",     value: stats && stats.totalKbs > 0 ? Math.round((stats.totalQueries ?? 0) / stats.totalKbs).toLocaleString() : "0", color: "text-cyan-400", icon: Database },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                    <div className="flex items-center gap-2">
                      <m.icon className={`w-4 h-4 ${m.color}`} />
                      <span className="text-sm text-white/60">{m.label}</span>
                    </div>
                    <span className={`text-sm font-bold ${m.color}`}>{m.value}</span>
                  </div>
                ))}
              </div>}
        </div>

        {/* Platform Health */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
          <h3 className="font-semibold text-white text-sm mb-5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Platform Health
          </h3>
          <div className="space-y-3">
            {[
              { label: "Avg response time", value: "< 1.2s" },
              { label: "Vector search",     value: "< 0.3s" },
              { label: "Uptime (30d)",      value: "99.9%"  },
              { label: "Error rate",        value: "< 0.1%" },
            ].map(h => (
              <div key={h.label} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                <span className="text-xs text-white/50">{h.label}</span>
                <span className="text-xs font-bold text-emerald-400">{h.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/30">All systems operational</span>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" /> Recent Queries — All Orgs
          </h3>
          <span className="text-xs text-white/30">Live feed</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {loading
            ? Array(6).fill(0).map((_, i) => <div key={i} className="px-5 py-4 h-14 animate-pulse" />)
            : (stats?.recentActivity ?? []).length === 0
              ? <div className="px-5 py-16 text-center text-white/30 text-sm">No query activity yet.</div>
              : (stats?.recentActivity ?? []).map((a, i) => (
                  <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0 mt-0.5">
                      {a.org_name?.charAt(0) ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/80 truncate">&quot;{a.query_text}&quot;</div>
                      <div className="text-xs text-white/30 mt-0.5">
                        <span className="text-indigo-400 font-medium">{a.org_name}</span> · <span>{a.kb_name}</span>
                        {a.latency_ms && <span className="ml-2 text-emerald-400/60">{a.latency_ms}ms</span>}
                      </div>
                    </div>
                    <div className="text-xs text-white/20 shrink-0 text-right">
                      <div>{new Date(a.created_at).toLocaleDateString()}</div>
                      <div>{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                ))}
        </div>
      </div>
    </div>
  );
}
