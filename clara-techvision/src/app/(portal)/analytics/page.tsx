"use client";
import { useEffect, useState } from "react";
import { BarChart3, MessageSquare, Clock, Database } from "lucide-react";
import { getKbsForOrg, getAnalytics, type KnowledgeBase, type AnalyticsData } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID || "";

export default function TVAnalytics() {
  const [kbs, setKbs]             = useState<KnowledgeBase[]>([]);
  const [activeKb, setActiveKb]   = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => { getKbsForOrg(ORG_ID).then(d => { setKbs(d); if (d.length) setActiveKb(d[0].id); }); }, []);
  useEffect(() => { if (!activeKb) return; setLoading(true); getAnalytics(activeKb).then(setAnalytics).catch(() => null).finally(() => setLoading(false)); }, [activeKb]);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <select value={activeKb} onChange={e => setActiveKb(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500/50">
          {kbs.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label:"Total Queries",   value:loading?"…":(analytics?.total??0).toLocaleString(),  icon:MessageSquare, color:"text-sky-400" },
          { label:"Avg Latency",     value:loading?"…":analytics?.avg_latency != null?`${analytics.avg_latency.toFixed(0)}ms`:"—", icon:Clock, color:"text-indigo-400" },
          { label:"Active KBs",      value:kbs.length,                                            icon:Database, color:"text-emerald-400" },
        ].map(c => (
          <div key={c.label} className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3"><span className="text-xs text-white/40">{c.label}</span><c.icon className={`w-4 h-4 ${c.color}`} /></div>
            <div className="text-2xl font-black text-white">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-6 mb-6">
        <h3 className="font-semibold text-white mb-4">Daily Queries (30 days)</h3>
        {loading ? <div className="h-40 flex items-center justify-center text-white/30 text-sm">Loading…</div>
          : (analytics?.daily?.length ?? 0) === 0 ? <div className="h-40 flex items-center justify-center text-white/30 text-sm">No data yet</div>
          : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={analytics!.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} tickFormatter={d=>d.slice(5)} />
              <YAxis tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} />
              <Tooltip contentStyle={{background:"#0c1929",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"#fff"}} />
              <Bar dataKey="count" fill="#0ea5e9" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
