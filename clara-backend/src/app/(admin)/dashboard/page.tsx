"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Building2, Users, TrendingUp, Activity,
  ArrowUpRight, Database, FileText, DollarSign,
  CheckCircle, Clock, AlertCircle, RefreshCw, BarChart3, MessageSquare
} from "lucide-react";
import Link from "next/link";

type Stats = {
  totalOrgs: number; totalUsers: number; mrr: number;
  payingOrgs: number; totalQueries: number; totalKbs: number;
  totalDocuments: number; totalQueriesThisMonth: number;
  recentActivity: RecentActivity[];
};
type RecentActivity = {
  kb_name: string; org_name: string; query_text: string; created_at: string;
};
type Org = {
  id: string; name: string; slug: string; plan_id: string;
  sub_status: string; price_usd: number;
  kb_count: number; user_count: number; query_count: number; created_at: string;
};
type Revenue = {
  totalMrr: number; totalArr: number;
  byPlan: { plan_id: string; plan_name: string; price_usd: number; org_count: number; plan_mrr: number }[];
  planDist: { plan_id: string; count: number }[];
};

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-slate-700/60 text-slate-300",
  starter:    "bg-cyan-900/40 text-cyan-300 border border-cyan-700/30",
  pro:        "bg-indigo-900/40 text-indigo-300 border border-indigo-700/30",
  enterprise: "bg-amber-900/40 text-amber-300 border border-amber-700/30",
};
const PLAN_BAR: Record<string, string> = {
  free: "bg-slate-500", starter: "bg-cyan-500", pro: "bg-indigo-500", enterprise: "bg-amber-500",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  active:   <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
  trialing: <Clock className="w-3.5 h-3.5 text-amber-400" />,
  past_due: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
};
type Tab = "overview" | "orgs" | "subscriptions" | "activity";

export default function AdminDashboard() {
  const [tab, setTab]         = useState<Tab>("overview");
  const [stats, setStats]     = useState<Stats | null>(null);
  const [orgs, setOrgs]       = useState<Org[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/platform/stats").then(r => r.json()).catch(() => null),
      fetch("/api/platform/orgs?perPage=20").then(r => r.json()).catch(() => ({ orgs: [] })),
      fetch("/api/platform/revenue").then(r => r.json()).catch(() => null),
    ]).then(([s, o, rev]) => {
      setStats(s);
      setOrgs(o?.orgs ?? []);
      setRevenue(rev);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const arr = (stats?.mrr ?? 0) * 12;
  const arpu = stats && stats.payingOrgs > 0 ? Math.round((stats.mrr ?? 0) / stats.payingOrgs) : 0;
  const totalOrgsForDist = Math.max(orgs.length, 1);

  const statCards = [
    { label: "Organisations",       value: stats?.totalOrgs ?? "—",    icon: Building2,  color: "text-violet-400" },
    { label: "Total Users",         value: stats?.totalUsers ?? "—",   icon: Users,      color: "text-cyan-400" },
    { label: "MRR",                 value: stats ? `$${(stats.mrr ?? 0).toLocaleString()}` : "—", icon: DollarSign, color: "text-emerald-400" },
    { label: "ARR",                 value: stats ? `$${arr.toLocaleString()}` : "—",   icon: TrendingUp, color: "text-emerald-300" },
    { label: "Knowledge Bases",     value: stats?.totalKbs ?? "—",     icon: Database,  color: "text-indigo-400" },
    { label: "Total Documents",     value: stats?.totalDocuments ?? "—", icon: FileText, color: "text-pink-400" },
    { label: "Queries This Month",  value: stats?.totalQueriesThisMonth?.toLocaleString() ?? "—", icon: Activity, color: "text-amber-400" },
    { label: "ARPU",                value: arpu > 0 ? `$${arpu}` : "—", icon: BarChart3, color: "text-blue-400" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-white/40 text-sm mt-0.5">Live stats — Clara AI super-admin</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border border-white/[0.08] bg-white/[0.03] rounded-xl p-1 w-fit mb-8">
        {(["overview", "orgs", "subscriptions", "activity"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${tab === t ? "bg-indigo-600 text-white shadow" : "text-white/40 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map(c => (
              <div key={c.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40">{c.label}</span>
                  <c.icon className={`w-4 h-4 ${c.color}`} />
                </div>
                <div className="text-2xl font-black text-white">
                  {loading ? <div className="h-7 w-14 bg-white/[0.06] rounded animate-pulse" /> : c.value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Plan distribution */}
            <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
              <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" /> Plan Distribution
              </h3>
              <div className="space-y-3">
                {loading ? Array(4).fill(0).map((_, i) => <div key={i} className="h-8 bg-white/[0.04] rounded animate-pulse" />) :
                  (revenue?.planDist ?? []).map(p => {
                    const pct = Math.round((p.count / totalOrgsForDist) * 100);
                    return (
                      <div key={p.plan_id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/60 capitalize">{p.plan_id}</span>
                          <span className="text-white/40">{p.count}</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className={`h-full ${PLAN_BAR[p.plan_id] ?? "bg-slate-500"} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Recent orgs */}
            <div className="lg:col-span-2 border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <h3 className="font-semibold text-white text-sm">Recent Organisations</h3>
                <button onClick={() => setTab("orgs")} className="text-xs text-indigo-400 hover:text-indigo-300">View all →</button>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {loading ? Array(3).fill(0).map((_, i) => <div key={i} className="px-5 py-4 h-14 animate-pulse" />) :
                  orgs.slice(0, 5).map(org => (
                    <div key={org.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                          {org.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{org.name}</div>
                          <div className="text-xs text-white/30">{org.kb_count} KBs · {org.user_count} users</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[org.plan_id] ?? PLAN_BADGE.free}`}>{org.plan_id ?? "free"}</span>
                        {STATUS_ICON[org.sub_status] ?? null}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" /> Recent Platform Queries
              </h3>
              <button onClick={() => setTab("activity")} className="text-xs text-indigo-400 hover:text-indigo-300">All activity →</button>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {loading ? Array(4).fill(0).map((_, i) => <div key={i} className="px-5 py-3 h-12 animate-pulse" />) :
                (stats?.recentActivity ?? []).slice(0, 5).map((a, i) => (
                  <div key={i} className="flex items-start gap-4 px-5 py-3 hover:bg-white/[0.02]">
                    <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-300 shrink-0 mt-0.5">
                      {a.org_name?.charAt(0) ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/70 truncate">{a.query_text}</div>
                      <div className="text-xs text-white/30 mt-0.5">{a.org_name} → {a.kb_name}</div>
                    </div>
                    <div className="text-xs text-white/20 shrink-0">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              {!loading && !(stats?.recentActivity?.length) && (
                <div className="px-5 py-8 text-center text-white/30 text-sm">No queries yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ORGS TAB */}
      {tab === "orgs" && (
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h3 className="font-semibold text-white text-sm">All Organisations ({orgs.length})</h3>
            <Link href="/orgs" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">Full management <ArrowUpRight className="w-3 h-3" /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06]">
                  {["Organisation", "Plan", "Status", "KBs", "Users", "Queries", "MRR", "Joined", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? <tr><td colSpan={9} className="px-5 py-12 text-center text-white/30">Loading…</td></tr> :
                  orgs.map(org => (
                    <tr key={org.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">{org.name.charAt(0)}</div>
                          <div>
                            <div className="font-medium text-white text-sm">{org.name}</div>
                            <div className="text-xs text-white/30">{org.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_BADGE[org.plan_id] ?? PLAN_BADGE.free}`}>{(org.plan_id ?? "free").toUpperCase()}</span></td>
                      <td className="px-5 py-4"><div className="flex items-center gap-1.5">{STATUS_ICON[org.sub_status] ?? null}<span className="text-xs text-white/50">{org.sub_status ?? "none"}</span></div></td>
                      <td className="px-5 py-4 text-white/60">{org.kb_count}</td>
                      <td className="px-5 py-4 text-white/60">{org.user_count}</td>
                      <td className="px-5 py-4 text-white/60">{org.query_count.toLocaleString()}</td>
                      <td className="px-5 py-4"><span className={org.price_usd > 0 ? "text-emerald-400 text-sm" : "text-white/30 text-sm"}>{org.price_usd > 0 ? `$${org.price_usd}/mo` : "—"}</span></td>
                      <td className="px-5 py-4 text-white/30 text-xs">{new Date(org.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4"><Link href={`/orgs/${org.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">Manage →</Link></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBSCRIPTIONS TAB */}
      {tab === "subscriptions" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Monthly Recurring Revenue", value: revenue ? `$${revenue.totalMrr.toLocaleString()}` : "—", color: "text-emerald-400" },
              { label: "Annual Recurring Revenue",  value: revenue ? `$${revenue.totalArr.toLocaleString()}` : "—", color: "text-emerald-300" },
              { label: "Paying Organisations",      value: stats?.payingOrgs ?? "—",                               color: "text-indigo-400" },
            ].map(s => (
              <div key={s.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
                <div className="text-xs text-white/40 mb-2">{s.label}</div>
                <div className={`text-3xl font-black ${s.color}`}>{loading ? "—" : s.value}</div>
              </div>
            ))}
          </div>

          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
            <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /> Revenue by Plan</h3>
            <div className="space-y-2">
              {(revenue?.byPlan ?? []).map(r => (
                <div key={r.plan_id} className="flex items-center justify-between py-3 border-b border-white/[0.05] last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${PLAN_BAR[r.plan_id] ?? "bg-slate-500"}`} />
                    <span className="text-sm font-medium text-white">{r.plan_name}</span>
                    <span className="text-xs text-white/30">{r.org_count} {r.org_count === 1 ? "org" : "orgs"}</span>
                    {r.price_usd > 0 && <span className="text-xs text-white/20">${r.price_usd}/mo each</span>}
                  </div>
                  <span className={`text-sm font-bold ${r.price_usd > 0 ? "text-emerald-400" : "text-white/30"}`}>
                    {r.price_usd > 0 ? `$${r.plan_mrr.toLocaleString()}/mo` : "$0"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-400" /> Plan Distribution</h3>
            <div className="space-y-3">
              {(revenue?.planDist ?? []).map(p => {
                const pct = Math.round((p.count / totalOrgsForDist) * 100);
                return (
                  <div key={p.plan_id}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-white/70 capitalize font-medium">{p.plan_id}</span>
                      <span className="text-white/40">{p.count} orgs · {pct}%</span>
                    </div>
                    <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className={`h-full ${PLAN_BAR[p.plan_id] ?? "bg-slate-500"} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-center">
            <Link href="/subscriptions" className="text-sm text-indigo-400 hover:text-indigo-300">Manage individual org plans →</Link>
          </div>
        </div>
      )}

      {/* ACTIVITY TAB */}
      {tab === "activity" && (
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="font-semibold text-white text-sm">Recent Platform Activity</h3>
            <p className="text-xs text-white/30 mt-0.5">Latest queries across all organisations</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {loading ? Array(8).fill(0).map((_, i) => <div key={i} className="px-5 py-4 h-14 animate-pulse" />) :
              (stats?.recentActivity ?? []).map((a, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02]">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                    {a.org_name?.charAt(0) ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/80 truncate">"{a.query_text}"</div>
                    <div className="text-xs text-white/30 mt-0.5"><span className="text-indigo-400">{a.org_name}</span> · {a.kb_name}</div>
                  </div>
                  <div className="text-xs text-white/20 shrink-0 text-right">
                    <div>{new Date(a.created_at).toLocaleDateString()}</div>
                    <div>{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              ))}
            {!loading && !(stats?.recentActivity?.length) && (
              <div className="px-5 py-16 text-center text-white/30 text-sm">No activity yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
