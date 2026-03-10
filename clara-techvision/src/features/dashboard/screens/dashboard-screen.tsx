"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, ArrowUpRight, TrendingUp } from "lucide-react";
import { getKbsForOrg, getOrgSubscription, type KnowledgeBase, type OrgUsage, type Subscription } from "@/lib/api";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "10000000-0000-0000-0000-000000000002";

export default function TVDashboard() {
  const [kbs, setKbs]     = useState<KnowledgeBase[]>([]);
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [plan, setPlan]   = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getKbsForOrg(ORG_ID).catch(() => [] as KnowledgeBase[]),
      getOrgSubscription(ORG_ID).catch(() => null),
    ]).then(([kbsData, subData]) => {
      setKbs(kbsData);
      if (subData) { setUsage(subData.usage); setPlan(subData.subscription); }
    }).finally(() => setLoading(false));
  }, []);

  const maxKbs  = plan?.max_kbs ?? 3;
  const maxReq  = plan?.max_req_day ?? 1000;
  const reqToday = usage?.requests_today ?? 0;
  const reqPct  = maxReq > 0 ? Math.min(100, Math.round(reqToday / maxReq * 100)) : 0;
  const totalDocs = kbs.reduce((s, k) => s + k.docCount, 0);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">TechVision Solutions AI Portal</p>
        </div>
        <Link href="/demo-website" className="flex items-center gap-2 text-sm bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 px-4 py-2 rounded-xl transition-colors">
          See widget demo <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Plan notice */}
      <div className="flex items-center justify-between p-4 border border-sky-500/20 bg-sky-500/5 rounded-2xl mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Starter Plan</div>
            <div className="text-xs text-white/40">{maxKbs} KBs · {maxReq.toLocaleString()} requests/day</div>
          </div>
        </div>
        <a href="http://localhost:3000/pricing" target="_blank"
          className="text-xs text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg hover:bg-sky-500/10 transition-colors">
          Upgrade to Pro →
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Knowledge Bases",   value: loading ? "…" : `${kbs.length} / ${maxKbs}`,          color: "text-sky-400" },
          { label: "Requests Today",    value: loading ? "…" : reqToday.toLocaleString(),              color: "text-indigo-400" },
          { label: "Total Documents",   value: loading ? "…" : totalDocs.toString(),                   color: "text-emerald-400" },
          { label: "Daily Limit Used",  value: loading ? "…" : `${reqPct}%`,                           color: reqPct >= 80 ? "text-amber-400" : "text-cyan-400" },
        ].map(c => (
          <div key={c.label} className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-5">
            <div className="text-xs text-white/40 mb-3">{c.label}</div>
            <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      <div className="border border-white/[0.06] bg-white/[0.02] rounded-2xl p-5 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-white/60">Daily Request Usage</span>
          <span className={reqPct >= 80 ? "text-amber-400 font-semibold" : "text-white/40"}>{reqPct}%</span>
        </div>
        <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${reqPct >= 80 ? "bg-amber-500" : "bg-sky-500"}`}
            style={{ width: `${reqPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-white/25 mt-1.5">
          <span>{reqToday} used</span><span>{maxReq.toLocaleString()} limit</span>
        </div>
      </div>

      {/* KBs */}
      <div className="border border-white/[0.06] bg-white/[0.02] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
          <h3 className="font-semibold text-white">Knowledge Bases</h3>
          <Link href="/knowledge-bases" className="text-xs text-sky-400 hover:text-sky-300 transition-colors">Manage →</Link>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-white/30 text-sm">Loading…</div>
        ) : kbs.length === 0 ? (
          <div className="px-5 py-8 text-center"><Database className="w-8 h-8 text-white/20 mx-auto mb-2"/><p className="text-white/40 text-sm">No knowledge bases yet.</p></div>
        ) : kbs.map(kb => (
          <div key={kb.id} className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white text-sm">{kb.name}</div>
              <div className="text-xs text-white/30">{kb.docCount} docs · {kb.readyCount} ready</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${kb.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>{kb.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
