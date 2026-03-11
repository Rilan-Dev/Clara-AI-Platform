"use client";
import { useEffect, useState } from "react";
import { TrendingUp, MessageSquare, Clock, Database } from "lucide-react";
import { useKnowledgeBases } from "@/features/knowledge-bases/hooks/use-knowledge-bases";
import { useKnowledgeBaseAnalytics } from "@/features/analytics/hooks/use-kb-analytics";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { KnowledgeBase } from "@/services/api/portal.types";

export default function AnalyticsPage() {
  const [activeKb, setActiveKb]   = useState("");
  const knowledgeBasesQuery = useKnowledgeBases();
  const analyticsQuery = useKnowledgeBaseAnalytics(activeKb, "30d");
  const knowledgeBases: KnowledgeBase[] = knowledgeBasesQuery.data ?? [];
  const analytics = analyticsQuery.data ?? null;
  const loading = knowledgeBasesQuery.isLoading || analyticsQuery.isLoading;

  useEffect(() => {
    if (!activeKb && knowledgeBasesQuery.data && knowledgeBasesQuery.data.length > 0) {
      setActiveKb(knowledgeBasesQuery.data[0].id);
    }
  }, [activeKb, knowledgeBasesQuery.data]);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-white/40 text-sm mt-0.5">Query insights for the last 30 days</p>
        </div>
        <select value={activeKb} onChange={e => setActiveKb(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c8821a]/50">
          {knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Queries",    value: loading ? "…" : (analytics?.total ?? 0).toLocaleString(),          icon: MessageSquare, color: "text-[#c8821a]" },
          { label: "Avg Latency",      value: loading ? "…" : analytics?.avg_latency != null ? `${analytics.avg_latency.toFixed(0)}ms` : "—", icon: Clock,         color: "text-cyan-400" },
          { label: "Active KBs",       value: knowledgeBases.length,                                               icon: Database,      color: "text-indigo-400" },
          { label: "Trend",            value: "↑",                                                                  icon: TrendingUp,    color: "text-emerald-400" },
        ].map(c => (
          <div key={c.label} className="border border-white/[0.07] bg-white/[0.03] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-black text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="border border-white/[0.07] bg-white/[0.03] rounded-2xl p-6 mb-6">
        <h3 className="font-semibold text-white mb-4">Daily Query Volume (30 days)</h3>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-white/30 text-sm">Loading chart…</div>
        ) : (analytics?.daily?.length ?? 0) === 0 ? (
          <div className="h-48 flex items-center justify-center text-white/30 text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics!.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0c1d3a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
              <Bar dataKey="count" fill="#c8821a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top queries */}
      <div className="border border-white/[0.07] bg-white/[0.03] rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">Top Queries</h3>
        {(analytics?.top_queries?.length ?? 0) === 0 ? (
          <p className="text-white/30 text-sm">No queries yet.</p>
        ) : (
          <div className="space-y-2">
             {analytics!.top_queries.slice(0, 8).map((q: { query: string; count: number }, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-bold text-white/20 w-5">{i + 1}</span>
                <div className="flex-1 text-sm text-white/70 truncate">{q.query}</div>
                <span className="text-xs text-white/30">{q.count}×</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
