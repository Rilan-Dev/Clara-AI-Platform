"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Building2, Database, Users, Activity,
  CreditCard, CheckCircle, Clock, RefreshCw
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

type Org = {
  id: string; name: string; slug: string; logo_url: string | null;
  plan_id: string; sub_status: string; price_usd: number;
  kb_count: number; user_count: number; query_count: number;
  created_at: string;
};
type Plan = { id: string; name: string; price_usd: number };

const PLAN_BADGE: Record<string, string> = {
  free: "bg-slate-700/60 text-slate-300",
  starter: "bg-cyan-900/40 text-cyan-300 border border-cyan-700/30",
  pro: "bg-indigo-900/40 text-indigo-300 border border-indigo-700/30",
  enterprise: "bg-amber-900/40 text-amber-300 border border-amber-700/30",
};

export default function OrgDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const [org, setOrg]       = useState<Org | null>(null);
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => {
    Promise.all([
      fetch(apiUrl(`/api/platform/orgs?perPage=100`)).then(r => r.json()),
      fetch(apiUrl("/api/subscriptions/plans")).then(r => r.json()),
    ]).then(([orgsData, plansData]) => {
      const found = (orgsData.orgs ?? []).find((o: Org) => o.id === id);
      setOrg(found ?? null);
      setPlans(plansData.plans ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  async function changePlan(planId: string) {
    if (!org) return;
    setUpdating(true);
    setMsg("");
    try {
      await fetch(apiUrl("/api/orgs/subscription"), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId: org.id, planId }),
      });
      setOrg(o => o ? { ...o, plan_id: planId } : o);
      setMsg("Plan updated successfully");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-white/40">
        <RefreshCw className="w-5 h-5 animate-spin" /> Loading organisation…
      </div>
    );
  }
  if (!org) {
    return (
      <div className="p-8">
        <p className="text-white/40">Organisation not found.</p>
        <Link href="/orgs" className="text-indigo-400 text-sm mt-2 inline-block">← Back to orgs</Link>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Back */}
      <Link href="/orgs" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> All Organisations
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-2xl font-bold text-indigo-300">
          {org.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{org.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-white/40 text-sm font-mono">/{org.slug}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[org.plan_id] ?? PLAN_BADGE.free}`}>
              {org.plan_id ?? "free"}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs ${org.sub_status === "active" ? "text-emerald-400" : "text-amber-400"}`}>
              {org.sub_status === "active" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {org.sub_status ?? "inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Knowledge Bases", value: org.kb_count,    icon: Database,  color: "text-indigo-400" },
          { label: "Users",           value: org.user_count,  icon: Users,     color: "text-cyan-400" },
          { label: "Total Queries",   value: org.query_count.toLocaleString(), icon: Activity, color: "text-violet-400" },
          { label: "MRR",             value: org.price_usd > 0 ? `$${org.price_usd}/mo` : "Free", icon: CreditCard, color: "text-emerald-400" },
        ].map(c => (
          <div key={c.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-black text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Plan Management */}
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-indigo-400" /> Subscription Plan
        </h2>
        {msg && <div className="text-xs text-emerald-400 mb-4 flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" />{msg}</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {plans.map(plan => (
            <button key={plan.id}
              onClick={() => changePlan(plan.id)}
              disabled={updating || org.plan_id === plan.id}
              className={`p-4 rounded-xl border text-left transition-all ${
                org.plan_id === plan.id
                  ? "border-indigo-500/50 bg-indigo-600/10 cursor-default"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20"
              } disabled:opacity-60`}>
              <div className="text-xs font-semibold text-indigo-400 mb-1">{plan.name}</div>
              <div className="text-sm font-bold text-white">
                {plan.price_usd === -1 ? "Custom" : plan.price_usd === 0 ? "Free" : `$${plan.price_usd}/mo`}
              </div>
              {org.plan_id === plan.id && (
                <div className="flex items-center gap-1 mt-1.5">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Active</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Org Info */}
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-violet-400" /> Organisation Info
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["ID", org.id],
            ["Slug", `/${org.slug}`],
            ["Created", new Date(org.created_at).toLocaleString()],
            ["Plan", org.plan_id ?? "free"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-xs text-white/40 mb-1">{k}</div>
              <div className="text-white/80 font-mono text-xs break-all">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
