"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Activity, FileText, Clock, ArrowUpRight, AlertTriangle } from "lucide-react";
import { getKbsForOrg, getOrgSubscription, type KnowledgeBase, type OrgUsage, type Subscription } from "@/lib/api";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "";

export default function Dashboard() {
  const [kbs, setKbs]     = useState<KnowledgeBase[]>([]);
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [plan, setPlan]   = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = ORG_ID;
    if (!orgId) return;
    Promise.all([
      getKbsForOrg(orgId).catch(() => [] as KnowledgeBase[]),
      getOrgSubscription(orgId).catch(() => null),
    ]).then(([kbsData, subData]) => {
      setKbs(kbsData);
      if (subData) { setUsage(subData.usage); setPlan(subData.subscription); }
    }).finally(() => setLoading(false));
  }, []);

  const totalDocs   = kbs.reduce((s, k) => s + k.docCount,   0);
  const readyDocs   = kbs.reduce((s, k) => s + k.readyCount, 0);
  const maxReq      = plan?.max_req_day ?? 10000;
  const reqToday    = usage?.requests_today ?? 0;
  const reqPct      = maxReq > 0 ? Math.min(100, Math.round(reqToday / maxReq * 100)) : 0;
  const maxKbs      = plan?.max_kbs ?? 10;

  const statCards = [
    { label: "Knowledge Bases",    value: loading ? "…" : `${kbs.length} / ${maxKbs === -1 ? "∞" : maxKbs}`, icon: Database,  color: "text-[#c8821a]" },
    { label: "Requests Today",     value: loading ? "…" : `${reqToday.toLocaleString()} / ${maxReq === -1 ? "∞" : maxReq.toLocaleString()}`, icon: Activity, color: "text-indigo-400" },
    { label: "Documents Ready",    value: loading ? "…" : `${readyDocs} / ${totalDocs}`, icon: FileText,  color: "text-emerald-400" },
    { label: "Avg Response Time",  value: "—",                              icon: Clock,     color: "text-cyan-400" },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">Welcome to Omen United Insurance AI Portal</p>
        </div>
        <Link href="/chat" className="flex items-center gap-2 text-sm bg-[#c8821a]/15 hover:bg-[#c8821a]/25 text-[#c8821a] border border-[#c8821a]/25 px-4 py-2 rounded-xl transition-colors">
          Open AI Chat <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map(c => (
          <div key={c.label} className="border border-white/[0.07] bg-white/[0.03] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-black text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Request usage meter */}
      <div className="border border-white/[0.07] bg-white/[0.03] rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">Daily Request Usage</span>
          <span className={`text-xs font-semibold ${reqPct >= 95 ? "text-red-400" : reqPct >= 80 ? "text-amber-400" : "text-emerald-400"}`}>{reqPct}%</span>
        </div>
        <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${reqPct >= 95 ? "bg-red-500" : reqPct >= 80 ? "bg-amber-500" : "bg-[#c8821a]"}`}
            style={{ width: `${reqPct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-white/30">
          <span>{reqToday.toLocaleString()} used</span>
          <span>{maxReq === -1 ? "Unlimited" : `${maxReq.toLocaleString()} limit`}</span>
        </div>
      </div>

      {/* KB list */}
      <div className="border border-white/[0.07] bg-white/[0.03] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h3 className="font-semibold text-white">Knowledge Bases</h3>
          <Link href="/knowledge-bases" className="text-xs text-[#c8821a] hover:text-[#fbbf24] transition-colors">Manage →</Link>
        </div>
        {loading ? (
          <div className="px-6 py-10 text-center text-white/30 text-sm">Loading knowledge bases…</div>
        ) : kbs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Database className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No knowledge bases yet.</p>
            <Link href="/knowledge-bases" className="text-xs text-[#c8821a] mt-2 inline-block">Create one →</Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {kbs.map(kb => (
              <div key={kb.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-[#c8821a]/10 border border-[#c8821a]/20 flex items-center justify-center">
                  <Database className="w-4 h-4 text-[#c8821a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm truncate">{kb.name}</div>
                  <div className="text-xs text-white/40">{kb.docCount} documents · {kb.readyCount} ready</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kb.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                    {kb.status}
                  </span>
                  <Link href={`/chat?kb=${kb.id}`} className="text-xs text-[#c8821a] hover:text-[#fbbf24] transition-colors">Chat →</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
