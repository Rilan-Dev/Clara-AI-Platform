"use client";
/**
 * Admin Subscriptions Screen — Phase 6
 * - Plan management (change plan per org)
 * - Subscription actions: cancel, pause, resume, reactivate
 * - Trial management: extend trial, convert trial to paid
 * - Billing history drawer: payment events + audit log
 * - Notification queue status panel
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  CreditCard, TrendingUp, Users, BarChart3, RefreshCw, Check,
  ChevronDown, X, Clock, AlertTriangle, Play, Pause, Ban,
  RotateCcw, Gift, Zap, Receipt, Shield, Bell, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Mail, ExternalLink,
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
  if (cents && cents > 0)  return `${(cents  / 100).toFixed(2)}`;
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
              {!isTrialing && <p className="text-xs text-white/30 text-center">"Convert Trial" is only available for trialing orgs.</p>}
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
