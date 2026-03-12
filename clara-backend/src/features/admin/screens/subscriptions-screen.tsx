"use client";
/**
 * Admin Subscriptions Screen — Phase 6
 * - Plan management (change plan per org)
 * - Subscription actions: cancel, pause, resume, reactivate
 * - Trial management: extend trial, convert trial to paid
 * - Billing history drawer: payment events + audit log
 * - Notification queue status panel
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  CreditCard, TrendingUp, BarChart3, RefreshCw, Check,
  X, Clock, Play, Pause, Ban,
  RotateCcw, Gift, Zap, Receipt, Shield, Bell, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Mail,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = {
  id: string; name: string; price_usd: number;
  max_kbs: number; max_docs_per_kb: number; max_req_day: number;
  voice_enabled: boolean; api_access: boolean;
};

type OrgSub = {
  org_id: string; name: string; slug: string;
  plan_id: string; sub_status: string; price_usd: number;
  created_at: string; kb_count: number; user_count: number; query_count: number;
};

type BillingEvent = {
  id: string; gateway: string; event_type: string;
  plan_id: string | null; amount_cents: number | null; amount_paise: number | null;
  currency: string; status: string; created_at: string;
};

type AuditEntry = {
  id: string; actor_label: string; action: string;
  old_plan_id: string | null; new_plan_id: string | null;
  old_status: string | null; new_status: string | null;
  note: string | null; created_at: string;
};

type ModalState =
  | { type: "action"; orgId: string; orgName: string; planId: string; status: string }
  | { type: "history"; orgId: string; orgName: string }
  | null;

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-slate-700/60 text-slate-300",
  starter:    "bg-cyan-900/50 text-cyan-300 border border-cyan-700/30",
  pro:        "bg-indigo-900/50 text-indigo-300 border border-indigo-700/30",
  enterprise: "bg-amber-900/50 text-amber-300 border border-amber-700/30",
};

const PLAN_COLOR: Record<string, string> = {
  free: "#64748b", starter: "#06b6d4", pro: "#6366f1", enterprise: "#f59e0b",
};

const STATUS_STYLES: Record<string, string> = {
  active:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  trialing:  "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  paused:    "text-amber-400 bg-amber-500/10 border-amber-500/20",
  cancelled: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  past_due:  "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const AUDIT_ACTION_ICON: Record<string, React.ReactNode> = {
  plan_changed:    <CreditCard className="w-3.5 h-3.5 text-indigo-400" />,
  cancelled:       <Ban className="w-3.5 h-3.5 text-rose-400" />,
  paused:          <Pause className="w-3.5 h-3.5 text-amber-400" />,
  resumed:         <Play className="w-3.5 h-3.5 text-emerald-400" />,
  trial_extended:  <Gift className="w-3.5 h-3.5 text-cyan-400" />,
  trial_converted: <Zap className="w-3.5 h-3.5 text-violet-400" />,
  reactivated:     <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtAmount(cents: number | null, paise: number | null, currency: string) {
  if (cents && cents > 0) {
    const symbol = currency.toUpperCase() === "USD" ? "$" : `${currency.toUpperCase()} `;
    return `${symbol}${(cents / 100).toFixed(2)}`;
  }
  if (paise && paise > 0)  return `₹${(paise  / 100).toFixed(2)}`;
  return "—";
}

// ── Action Modal ─────────────────────────────────────────────────────────────

function ActionModal({ orgId, orgName, planId, status, plans, onClose, onDone }: {
  orgId: string; orgName: string; planId: string; status: string;
  plans: Plan[]; onClose: () => void; onDone: () => void;
}) {
  const [tab, setTab]         = useState<"plan" | "manage" | "trial">("plan");
  const [busy, setBusy]       = useState(false);
  const [note, setNote]       = useState("");
  const [trialDays, setTrialDays] = useState(7);
  const [targetPlan, setTargetPlan] = useState(planId);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  async function call(method: string, body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(apiUrl("/api/orgs/subscription"), {
        method, headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId, ...body }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Request failed");
      setMsg({ ok: true, text: "Done! Changes applied." });
      setTimeout(() => { onDone(); onClose(); }, 1000);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const isCancelled = status === "cancelled";
  const isTrialing  = status === "trialing";
  const isPaused    = status === "paused";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0f0f14] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Manage Subscription</h2>
            <p className="text-xs text-white/40 mt-0.5">{orgName}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          {(["plan","manage","trial"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-xs font-medium py-2.5 capitalize transition-all border-b-2 -mb-px
                ${tab === t ? "border-indigo-500 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}>
              {t === "plan" ? "Change Plan" : t === "manage" ? "Status Actions" : "Trial"}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">

          {/* TAB: Change Plan */}
          {tab === "plan" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {plans.map(p => (
                  <button key={p.id} onClick={() => setTargetPlan(p.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      targetPlan === p.id
                        ? "border-indigo-500/60 bg-indigo-500/10"
                        : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                      {targetPlan === p.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </div>
                    <div className="text-xs text-white/40">
                      {p.price_usd === 0 ? "Free" : p.price_usd === -1 ? "Custom" : `${p.price_usd}/mo`}
                    </div>
                  </button>
                ))}
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Admin note (optional)…"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 resize-none h-16 focus:outline-none focus:border-indigo-500/50" />
              <button disabled={busy || targetPlan === planId} onClick={() => call("PUT", { planId: targetPlan, note })}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-all">
                {busy ? "Saving…" : targetPlan === planId ? "(already on this plan)" : `Switch to ${plans.find(p=>p.id===targetPlan)?.name ?? targetPlan}`}
              </button>
            </div>
          )}

          {/* TAB: Status Actions */}
          {tab === "manage" && (
            <div className="space-y-3">
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason / admin note (optional)…"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 resize-none h-16 focus:outline-none focus:border-indigo-500/50" />

              <div className="grid grid-cols-2 gap-2">
                {/* Pause */}
                {!isPaused && !isCancelled && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"pause", note })}
                    className="flex items-center gap-2 justify-center bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/30 text-amber-300 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <Pause className="w-4 h-4" /> Pause
                  </button>
                )}
                {/* Resume */}
                {(isPaused || isCancelled) && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"resume", note })}
                    className="flex items-center gap-2 justify-center bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 text-emerald-300 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <Play className="w-4 h-4" /> Resume
                  </button>
                )}
                {/* Cancel */}
                {!isCancelled && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"cancel", note })}
                    className="flex items-center gap-2 justify-center bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/30 text-rose-300 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <Ban className="w-4 h-4" /> Cancel
                  </button>
                )}
                {/* Reactivate */}
                {isCancelled && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"reactivate", note })}
                    className="flex items-center gap-2 justify-center bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/30 text-indigo-300 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <RotateCcw className="w-4 h-4" /> Reactivate
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB: Trial */}
          {tab === "trial" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/50 mb-2 block">Extend trial by (days)</label>
                <div className="flex gap-2">
                  {[7,14,30].map(d => (
                    <button key={d} onClick={() => setTrialDays(d)}
                      className={`flex-1 text-sm font-medium py-2 rounded-lg border transition-all ${
                        trialDays === d ? "border-indigo-500 bg-indigo-500/10 text-white" : "border-white/[0.08] text-white/50 hover:text-white"
                      }`}>{d}d</button>
                  ))}
                  <input type="number" min={1} max={365} value={trialDays}
                    onChange={e => setTrialDays(parseInt(e.target.value)||7)}
                    className="w-20 text-sm text-center bg-white/[0.04] border border-white/[0.08] rounded-lg text-white focus:outline-none focus:border-indigo-500/50" />
                </div>
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)…"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 resize-none h-14 focus:outline-none focus:border-indigo-500/50" />
              <div className="grid grid-cols-2 gap-2">
                <button disabled={busy} onClick={() => call("PATCH", { action:"extend_trial", trialDays, note })}
                  className="flex items-center gap-2 justify-center bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-600/30 text-cyan-300 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                  <Gift className="w-4 h-4" /> Extend Trial
                </button>
                <button disabled={busy || !isTrialing} onClick={() => call("PATCH", { action:"convert_trial", planId: targetPlan, note })}
                  className="flex items-center gap-2 justify-center bg-violet-600/20 hover:bg-violet-600/30 border border-violet-600/30 text-violet-300 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                  <Zap className="w-4 h-4" /> Convert Trial
                </button>
              </div>
              {!isTrialing && <p className="text-xs text-white/30 text-center">&quot;Convert Trial&quot; is only available for trialing orgs.</p>}
            </div>
          )}

          {/* Feedback message */}
          {msg && (
            <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
              msg.ok
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}>
              {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              {msg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Billing History Drawer ───────────────────────────────────────────────────

// ── Notification Panel ──────────────────────────────────────────────────────

function NotificationPanel() {
  const [data, setData] = useState<{ notifications: unknown[]; summary: {status:string; count:number}[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/admin/notifications?limit=20"), { headers: withAuthHeaders({}) })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const NOTIF_STATUS_ICON: Record<string, React.ReactNode> = {
    sent:       <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    pending:    <Clock className="w-3.5 h-3.5 text-amber-400" />,
    failed:     <XCircle className="w-3.5 h-3.5 text-rose-400" />,
    suppressed: <AlertCircle className="w-3.5 h-3.5 text-slate-400" />,
  };

  return (
    <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-400" /> Email Notification Queue
        </h3>
        <div className="flex gap-3">
          {(data?.summary ?? []).map(s => (
            <span key={s.status} className="text-xs text-white/40 capitalize">
              {s.status}: <span className="text-white/70 font-medium">{s.count}</span>
            </span>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="py-8 text-center text-white/25 text-sm">Loading…</div>
      ) : !data?.notifications.length ? (
        <div className="py-8 text-center text-white/25 text-sm flex flex-col items-center gap-2">
          <Mail className="w-7 h-7 opacity-30" />
          No notifications queued yet
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {(data.notifications as Array<Record<string,unknown>>).map((n) => (
            <div key={n.id as string} className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
              <div className="shrink-0">{NOTIF_STATUS_ICON[n.status as string] ?? <AlertCircle className="w-3.5 h-3.5 text-white/30" />}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/80 truncate">{n.subject as string}</div>
                <div className="text-xs text-white/30 mt-0.5">
                  <span className="text-indigo-400/70">{n.org_name as string}</span>
                  {" · "}{n.recipient_email as string}
                  {" · "}{n.notification_type as string}
                </div>
              </div>
              <div className="text-xs text-white/25 shrink-0">{fmtDateTime(n.created_at as string)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────────────

export default function AdminSubscriptionsScreen() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [orgs,    setOrgs]    = useState<OrgSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [modal,   setModal]   = useState<ModalState>(null);
  const [notifPanel, setNotifPanel] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansData, orgsData] = await Promise.all([
        fetch(apiUrl("/api/subscriptions/plans")).then(r => r.json()),
        fetch(apiUrl("/api/platform/orgs?perPage=200"), { headers: withAuthHeaders({}) }).then(r => r.json()),
      ]);
      setPlans(plansData.plans ?? []);
      setOrgs(orgsData.orgs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const mrr     = orgs.reduce((s, o) => s + (o.price_usd > 0 ? o.price_usd : 0), 0);
  const paying  = orgs.filter(o => o.price_usd > 0).length;
  const trials  = orgs.filter(o => o.sub_status === "trialing").length;
  const paused  = orgs.filter(o => o.sub_status === "paused").length;

  const filtered = orgs.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.slug.toLowerCase().includes(search.toLowerCase())
  );

  const planDist = plans.map(p => ({
    ...p,
    count: orgs.filter(o => o.plan_id === p.id).length,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscription Management</h1>
          <p className="text-white/40 text-sm mt-0.5">Manage billing across all organisations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNotifPanel(p => !p)}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all ${
              notifPanel ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300" : "border-white/10 text-white/40 hover:text-white hover:border-white/20"
            }`}>
            <Bell className="w-3.5 h-3.5" /> Notifications
          </button>
          <button onClick={loadData}
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "MRR",         value: `${mrr.toLocaleString()}`,  icon: TrendingUp, color: "text-emerald-400" },
          { label: "ARR",         value: `${(mrr*12).toLocaleString()}`, icon: BarChart3, color: "text-indigo-400" },
          { label: "Paying Orgs", value: paying,                       icon: CreditCard, color: "text-cyan-400"   },
          { label: "On Trial",    value: trials,                       icon: Gift,       color: "text-amber-400"  },
          { label: "Paused",      value: paused,                       icon: Pause,      color: "text-rose-400"   },
        ].map(s => (
          <div key={s.label} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Notification panel (collapsible) */}
      {notifPanel && <NotificationPanel />}

      {/* Plan distribution */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {planDist.map(p => (
          <div key={p.id} className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_BADGE[p.id] ?? PLAN_BADGE.free}`}>{p.name}</span>
              <span className="text-lg font-bold text-white">{p.count}</span>
            </div>
            <div className="text-xs text-white/35">
              {p.price_usd === -1 ? "Custom pricing" : p.price_usd === 0 ? "Free tier" : `${p.price_usd}/mo each`}
            </div>
            {p.count > 0 && orgs.length > 0 && (
              <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width:`${(p.count/orgs.length)*100}%`, backgroundColor: PLAN_COLOR[p.id] ?? "#6366f1" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Org table */}
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
          <h2 className="font-semibold text-white text-sm shrink-0">All Organisations</h2>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="flex-1 max-w-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500/50" />
          <span className="text-xs text-white/30 shrink-0">{filtered.length} orgs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/[0.03]">
              <tr className="text-xs text-white/40 text-left">
                {["Organisation","Plan","Status","KBs","Queries","Joined","Actions"].map(h => (
                  <th key={h} className="px-5 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading
                ? Array(5).fill(0).map((_,i) => (
                    <tr key={i}>
                      {Array(7).fill(0).map((_,j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-white/[0.04] rounded animate-pulse" /></td>)}
                    </tr>
                  ))
                : filtered.map(org => {
                    const status = org.sub_status ?? "free";
                    return (
                      <tr key={org.org_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <div className="text-sm font-medium text-white">{org.name}</div>
                          <div className="text-xs text-white/30 font-mono">{org.slug}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[org.plan_id ?? "free"] ?? PLAN_BADGE.free}`}>
                            {org.plan_id ?? "free"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[status] ?? "text-white/40 bg-white/[0.04] border-white/[0.08]"}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-white/50">{org.kb_count}</td>
                        <td className="px-5 py-4 text-sm text-white/50">{org.query_count.toLocaleString()}</td>
                        <td className="px-5 py-4 text-xs text-white/30">{fmtDate(org.created_at)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setModal({ type:"action", orgId:org.org_id, orgName:org.name, planId:org.plan_id??"free", status })}
                              className="flex items-center gap-1.5 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/30 text-indigo-300 px-2.5 py-1.5 rounded-lg transition-all">
                              <CreditCard className="w-3 h-3" /> Manage
                            </button>
                            <button
                              onClick={() => setModal({ type:"history", orgId:org.org_id, orgName:org.name })}
                              className="flex items-center gap-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/50 hover:text-white px-2.5 py-1.5 rounded-lg transition-all">
                              <Receipt className="w-3 h-3" /> History
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && !filtered.length && (
            <div className="py-12 text-center text-white/25 text-sm">No organisations found</div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal?.type === "action" && (
        <ActionModal
          orgId={modal.orgId} orgName={modal.orgName}
          planId={modal.planId} status={modal.status}
          plans={plans}
          onClose={() => setModal(null)}
          onDone={loadData}
        />
      )}
      {modal?.type === "history" && (
        <BillingHistoryDrawer
          orgId={modal.orgId} orgName={modal.orgName}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── BillingHistoryDrawer (moved below main, order doesn’t matter in TS) ──────

function BillingHistoryDrawer({ orgId, orgName, onClose }: {
  orgId: string; orgName: string; onClose: () => void;
}) {
  const [data, setData] = useState<{ invoices: BillingEvent[]; auditLog: AuditEntry[] } | null>(null);
  const [tab, setTab]   = useState<"invoices" | "audit">("invoices");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/orgs/billing-history?orgId=${orgId}`), { headers: withAuthHeaders({}) })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [orgId]);

  const GATEWAY_BADGE: Record<string, string> = {
    stripe:    "bg-indigo-900/50 text-indigo-300",
    razorpay:  "bg-blue-900/50 text-blue-300",
    manual:    "bg-slate-700/60 text-slate-300",
  };
  const STATUS_DOT: Record<string, string> = {
    paid:     "bg-emerald-400",
    pending:  "bg-amber-400",
    failed:   "bg-rose-400",
    refunded: "bg-slate-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-[#0d0d12] border-l border-white/[0.08] flex flex-col shadow-2xl">

        {/* Drawer header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Billing History</h2>
            <p className="text-xs text-white/40 mt-0.5">{orgName}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] shrink-0">
          {(["invoices","audit"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-xs font-medium py-2.5 capitalize transition-all border-b-2 -mb-px flex items-center justify-center gap-1.5
                ${tab === t ? "border-indigo-500 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}>
              {t === "invoices" ? <><Receipt className="w-3.5 h-3.5" /> Payment Events</> : <><Shield className="w-3.5 h-3.5" /> Audit Log</>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-white/30 text-sm">Loading…</div>
          ) : tab === "invoices" ? (
            !data?.invoices.length ? (
              <div className="flex flex-col items-center justify-center h-40 text-white/25 text-sm gap-2">
                <Receipt className="w-8 h-8 opacity-30" /> No billing events yet
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {data.invoices.map(ev => (
                  <div key={ev.id} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${GATEWAY_BADGE[ev.gateway] ?? "bg-slate-700 text-slate-300"}`}>
                            {ev.gateway}
                          </span>
                          <span className="text-xs text-white/50 truncate">{ev.event_type}</span>
                        </div>
                        <div className="text-xs text-white/30">{fmtDateTime(ev.created_at)}</div>
                        {ev.plan_id && <div className="text-xs text-indigo-400/70 mt-0.5">Plan: {ev.plan_id}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-white">{fmtAmount(ev.amount_cents, ev.amount_paise, ev.currency)}</div>
                        <div className="flex items-center gap-1.5 mt-1 justify-end">
                          <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ev.status] ?? "bg-slate-400"}`} />
                          <span className="text-xs text-white/40 capitalize">{ev.status}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Audit log tab
            !data?.auditLog.length ? (
              <div className="flex flex-col items-center justify-center h-40 text-white/25 text-sm gap-2">
                <Shield className="w-8 h-8 opacity-30" /> No audit events yet
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {data.auditLog.map(entry => (
                  <div key={entry.id} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                        {AUDIT_ACTION_ICON[entry.action] ?? <Clock className="w-3.5 h-3.5 text-white/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-white capitalize">{entry.action.replace(/_/g," ")}</span>
                          <span className="text-xs text-white/25 capitalize">by {entry.actor_label}</span>
                        </div>
                        {(entry.old_plan_id || entry.new_plan_id) && (
                          <div className="text-xs text-white/40 flex items-center gap-1.5 mb-0.5">
                            {entry.old_plan_id && <span className="text-white/50">{entry.old_plan_id}</span>}
                            {entry.old_plan_id && entry.new_plan_id && <ChevronRight className="w-3 h-3" />}
                            {entry.new_plan_id && <span className="text-indigo-400">{entry.new_plan_id}</span>}
                          </div>
                        )}
                        {(entry.old_status || entry.new_status) && (
                          <div className="text-xs text-white/40 flex items-center gap-1.5 mb-0.5">
                            {entry.old_status && <span className="text-white/40">{entry.old_status}</span>}
                            {entry.old_status && entry.new_status && <ChevronRight className="w-3 h-3" />}
                            {entry.new_status && <span className="text-emerald-400/80">{entry.new_status}</span>}
                          </div>
                        )}
                        {entry.note && <p className="text-xs text-white/30 italic mt-0.5">&ldquo;{entry.note}&rdquo;</p>}
                        <div className="text-xs text-white/20 mt-1">{fmtDateTime(entry.created_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
