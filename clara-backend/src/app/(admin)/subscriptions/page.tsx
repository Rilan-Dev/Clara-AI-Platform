"use client";
import { useEffect, useState } from "react";
import { CreditCard, TrendingUp, Users, BarChart3, RefreshCw, Check } from "lucide-react";

type Plan = {
  id: string; name: string; price_usd: number; description: string;
  max_kbs: number; max_docs_per_kb: number; max_req_day: number;
  voice_enabled: boolean; api_access: boolean; custom_branding: boolean;
};
type OrgSub = {
  org_id: string; name: string; slug: string;
  plan_id: string; sub_status: string; price_usd: number;
  created_at: string;
};

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-slate-700 text-slate-300",
  starter:    "bg-cyan-900/50 text-cyan-300 border border-cyan-700/30",
  pro:        "bg-indigo-900/50 text-indigo-300 border border-indigo-700/30",
  enterprise: "bg-amber-900/50 text-amber-300 border border-amber-700/30",
};

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orgs, setOrgs] = useState<OrgSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/subscriptions/plans").then(r => r.json()),
      fetch("/api/platform/orgs?perPage=100").then(r => r.json()),
    ]).then(([plansData, orgsData]) => {
      setPlans(plansData.plans ?? []);
      setOrgs(orgsData.orgs ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const mrr = orgs.reduce((sum, o) => sum + (o.price_usd > 0 ? o.price_usd : 0), 0);
  const arr = mrr * 12;
  const paying = orgs.filter(o => o.price_usd > 0).length;

  const planDist = plans.map(p => ({
    ...p,
    count: orgs.filter(o => o.plan_id === p.id).length,
  }));

  async function changePlan(orgId: string, planId: string) {
    setUpdating(orgId);
    try {
      await fetch("/api/orgs/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, planId }),
      });
      const updated = await fetch("/api/platform/orgs?perPage=100").then(r => r.json());
      setOrgs(updated.orgs ?? []);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Subscription Management</h1>
        <p className="text-white/50 text-sm mt-1">Manage plans across all organisations</p>
      </div>

      {/* Revenue Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "MRR", value: `$${mrr.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-400" },
          { label: "ARR", value: `$${arr.toLocaleString()}`, icon: BarChart3, color: "text-indigo-400" },
          { label: "Paying Orgs", value: paying, icon: CreditCard, color: "text-amber-400" },
          { label: "Total Orgs", value: orgs.length, icon: Users, color: "text-cyan-400" },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Plan Distribution */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {planDist.map(p => (
          <div key={p.id} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_BADGE[p.id]}`}>
                {p.name}
              </span>
              <span className="text-lg font-bold text-white">{p.count}</span>
            </div>
            <div className="text-xs text-white/40">
              {p.price_usd === -1 ? "Custom pricing" : p.price_usd === 0 ? "Free tier" : `$${p.price_usd}/mo each`}
            </div>
            {p.count > 0 && orgs.length > 0 && (
              <div className="mt-2 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500/60 rounded-full transition-all"
                     style={{ width: `${(p.count / orgs.length) * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Org table with plan editor */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">All Organisations</h2>
          <button onClick={() => window.location.reload()} className="text-xs text-white/40 hover:text-white flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="py-16 text-center text-white/30 text-sm">Loading…</div>
        ) : (
          <table className="w-full">
            <thead className="bg-white/[0.03]">
              <tr className="text-xs text-white/40 text-left">
                <th className="px-6 py-3 font-medium">Organisation</th>
                <th className="px-6 py-3 font-medium">Current Plan</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Change Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {orgs.map(org => (
                <tr key={org.org_id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-white">{org.name}</div>
                    <div className="text-xs text-white/30">{org.slug}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[org.plan_id ?? "free"] ?? PLAN_BADGE.free}`}>
                      {org.plan_id ?? "free"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs ${org.sub_status === "active" ? "text-emerald-400" : "text-amber-400"}`}>
                      {org.sub_status ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 flex-wrap">
                      {plans.map(p => (
                        <button key={p.id}
                          disabled={updating === org.org_id || org.plan_id === p.id}
                          onClick={() => changePlan(org.org_id, p.id)}
                          className={`text-xs px-2.5 py-1 rounded-lg transition-all flex items-center gap-1
                            ${org.plan_id === p.id
                              ? "bg-indigo-600/20 text-indigo-400 cursor-default"
                              : "bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white"
                            } disabled:opacity-40`}>
                          {org.plan_id === p.id && <Check className="w-2.5 h-2.5" />}
                          {updating === org.org_id ? "…" : p.name}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
