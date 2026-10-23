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
import { motion } from "framer-motion";
import {
  CreditCard, TrendingUp, BarChart3, RefreshCw, Check,
  X, Clock, Play, Pause, Ban,
  RotateCcw, Gift, Zap, Receipt, Shield, Bell, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Mail,
  Send, Edit3, Plus, Building2, Cable,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { toast } from "@/components/ui/sonner";
import { LoadError } from "@/components/ui/load-error";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  PlanMcpEntitlementsEditor,
  PLAN_MCP_DISABLED,
  type PlanMcpEntitlements,
} from "@/features/admin/screens/plan-mcp-entitlements-editor";
import { PlatformOrgMcpEntitlementsPanel } from "@/features/admin/screens/platform-org-mcp-entitlements-panel";
import { usePlatformFeatures } from "@/features/admin/use-platform-features";

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  name: string;
  description: string;
  price_usd: number;
  max_kbs: number;
  max_docs_per_kb: number;
  max_req_day: number;
  max_storage_mb: number;
  max_tts_chars_day: number;
  max_stt_audio_sec_day: number;
  max_translation_chars_day: number;
  voice_enabled: boolean;
  api_access: boolean;
  custom_branding: boolean;
  multilingual_embeddings?: boolean;
  sso_enabled: boolean;
  analytics_level: string;
  priority_support: boolean;
  features: string[];
  mcp_entitlements?: PlanMcpEntitlements;
  published_version_id?: string;
  published_version?: number;
  draft_version_id?: string;
  draft_version?: number;
  version_count?: number;
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
  free:       "bg-muted text-muted-foreground",
  starter:    "bg-sky-500/10 text-sky-600 border border-sky-600/30",
  pro:        "bg-primary/10 text-primary border border-primary/30",
  enterprise: "bg-amber-500/10 text-amber-600 border border-amber-600/30",
};

const PLAN_COLOR: Record<string, string> = {
  free: "#64748b", starter: "#06b6d4", pro: "#6366f1", enterprise: "#f59e0b",
};

const STATUS_STYLES: Record<string, string> = {
  active:    "text-emerald-600 bg-emerald-500/10 border-emerald-600/20",
  trialing:  "text-sky-600 bg-sky-500/10 border-sky-600/20",
  paused:    "text-amber-600 bg-amber-500/10 border-amber-600/20",
  cancelled: "text-destructive bg-destructive/10 border-destructive/20",
  past_due:  "text-orange-600 bg-orange-500/10 border-orange-600/20",
};

const AUDIT_ACTION_ICON: Record<string, React.ReactNode> = {
  plan_changed:    <CreditCard className="w-3.5 h-3.5 text-primary" />,
  cancelled:       <Ban className="w-3.5 h-3.5 text-destructive" />,
  paused:          <Pause className="w-3.5 h-3.5 text-amber-600" />,
  resumed:         <Play className="w-3.5 h-3.5 text-emerald-600" />,
  trial_extended:  <Gift className="w-3.5 h-3.5 text-sky-600" />,
  trial_converted: <Zap className="w-3.5 h-3.5 text-violet-600" />,
  reactivated:     <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      {/* Mobile: bottom sheet; desktop: centered dialog */}
      <div className="relative max-h-[92dvh] w-full min-w-0 max-w-lg overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl flex flex-col sm:rounded-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>

        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">Manage Subscription</h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{orgName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-muted-foreground/70 hover:text-foreground active:bg-muted transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["plan","manage","trial"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-xs font-medium py-2.5 capitalize transition-all border-b-2 -mb-px
                ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground/70 hover:text-foreground"}`}>
              {t === "plan" ? "Change Plan" : t === "manage" ? "Status Actions" : "Trial"}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto overscroll-contain-y">

          {/* TAB: Change Plan */}
          {tab === "plan" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {plans.map(p => (
                  <button key={p.id} onClick={() => setTargetPlan(p.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      targetPlan === p.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-muted/50 hover:bg-muted"
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      {targetPlan === p.id && <Check className="w-3.5 h-3.5 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground/70">
                      {p.price_usd === 0 ? "Free" : p.price_usd === -1 ? "Custom" : `${p.price_usd}/mo`}
                    </div>
                  </button>
                ))}
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Admin note (optional)…"
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/80 resize-none h-16 focus:outline-none focus:border-primary/50" />
              <button disabled={busy || targetPlan === planId} onClick={() => call("PUT", { planId: targetPlan, note })}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-sm font-semibold py-2.5 rounded-xl transition-all">
                {busy ? "Saving…" : targetPlan === planId ? "(already on this plan)" : `Switch to ${plans.find(p=>p.id===targetPlan)?.name ?? targetPlan}`}
              </button>
            </div>
          )}

          {/* TAB: Status Actions */}
          {tab === "manage" && (
            <div className="space-y-3">
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason / admin note (optional)…"
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/80 resize-none h-16 focus:outline-none focus:border-primary/50" />

              <div className="grid grid-cols-2 gap-2">
                {/* Pause */}
                {!isPaused && !isCancelled && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"pause", note })}
                    className="flex items-center gap-2 justify-center bg-amber-500/10 hover:bg-amber-500/20 border border-amber-600/30 text-amber-700 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <Pause className="w-4 h-4" /> Pause
                  </button>
                )}
                {/* Resume */}
                {(isPaused || isCancelled) && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"resume", note })}
                    className="flex items-center gap-2 justify-center bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-600/30 text-emerald-700 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <Play className="w-4 h-4" /> Resume
                  </button>
                )}
                {/* Cancel */}
                {!isCancelled && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"cancel", note })}
                    className="flex items-center gap-2 justify-center bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                    <Ban className="w-4 h-4" /> Cancel
                  </button>
                )}
                {/* Reactivate */}
                {isCancelled && (
                  <button disabled={busy} onClick={() => call("PATCH", { action:"reactivate", note })}
                    className="flex items-center gap-2 justify-center bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
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
                <label className="text-xs text-muted-foreground mb-2 block">Extend trial by (days)</label>
                <div className="flex gap-2">
                  {[7,14,30].map(d => (
                    <button key={d} onClick={() => setTrialDays(d)}
                      className={`flex-1 text-sm font-medium py-2 rounded-lg border transition-all ${
                        trialDays === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>{d}d</button>
                  ))}
                  <input type="number" min={1} max={365} value={trialDays}
                    onChange={e => setTrialDays(parseInt(e.target.value)||7)}
                    className="w-20 text-sm text-center bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)…"
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/80 resize-none h-14 focus:outline-none focus:border-primary/50" />
              <div className="grid grid-cols-2 gap-2">
                <button disabled={busy} onClick={() => call("PATCH", { action:"extend_trial", trialDays, note })}
                  className="flex items-center gap-2 justify-center bg-sky-500/10 hover:bg-sky-500/20 border border-sky-600/30 text-sky-700 text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                  <Gift className="w-4 h-4" /> Extend Trial
                </button>
                <button disabled={busy || !isTrialing} onClick={() => call("PATCH", { action:"convert_trial", planId: targetPlan, note })}
                  className="flex items-center gap-2 justify-center bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 text-secondary text-sm font-medium py-2.5 rounded-xl transition-all disabled:opacity-40">
                  <Zap className="w-4 h-4" /> Convert Trial
                </button>
              </div>
              {!isTrialing && <p className="text-xs text-muted-foreground/70 text-center">&quot;Convert Trial&quot; is only available for trialing orgs.</p>}
            </div>
          )}

          {/* Feedback message */}
          {msg && (
            <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
              msg.ok
                ? "bg-emerald-500/10 border-emerald-600/20 text-emerald-600"
                : "bg-destructive/10 border-destructive/20 text-destructive"
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

type NotificationRow = {
  id: string; status: string; subject: string; org_name: string;
  recipient_email: string; notification_type: string; created_at: string;
  error_message?: string | null;
};

function NotificationPanel() {
  const [data, setData] = useState<{ notifications: NotificationRow[]; summary: {status:string; count:number}[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null); // row id, or "all"

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(apiUrl("/api/admin/notifications?limit=20"), { headers: withAuthHeaders({}) });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body as { notifications: NotificationRow[]; summary: {status:string; count:number}[] });
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Re-send failed emails through the CURRENT email provider — the fix after
  // correcting SMTP / Resend credentials in Settings → Email Delivery.
  async function retry(id?: string) {
    setRetrying(id ?? "all");
    try {
      const res = await fetch(apiUrl("/api/admin/notifications/retry"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      const result = await res.json().catch(() => ({})) as {
        error?: string; retried?: number; succeeded?: number; failed?: number;
        failures?: Array<{ error: string }>;
      };
      if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);
      if (!result.retried) toast.info("No failed emails to retry");
      else if (result.failed) {
        toast.warning(`${result.succeeded ?? 0} of ${result.retried} sent`, {
          description: result.failures?.[0]?.error,
        });
      } else toast.success(`${result.succeeded} ${result.succeeded === 1 ? "email" : "emails"} sent`);
      await load();
    } catch (e) {
      toast.error("Retry failed", { description: (e as Error).message });
    } finally {
      setRetrying(null);
    }
  }

  const failedCount = data?.summary.find(s => s.status === "failed")?.count ?? 0;

  const NOTIF_STATUS_ICON: Record<string, React.ReactNode> = {
    sent:       <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-label="Sent" />,
    pending:    <Clock className="w-3.5 h-3.5 text-amber-600" aria-label="Pending" />,
    failed:     <XCircle className="w-3.5 h-3.5 text-destructive" aria-label="Failed" />,
    suppressed: <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" aria-label="Suppressed" />,
  };

  return (
    <div className="border border-border bg-card rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" /> Email Notification Queue
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {(data?.summary ?? []).map(s => (
            <span key={s.status} className="text-xs text-muted-foreground capitalize">
              {s.status}: <span className="text-foreground/80 font-medium">{s.count}</span>
            </span>
          ))}
          {failedCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => void retry()} disabled={retrying !== null}>
              <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${retrying === "all" ? "animate-spin" : ""}`} />
              Retry failed ({failedCount})
            </Button>
          )}
        </div>
      </div>
      {loading ? (
        <div role="status" className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
      ) : loadError ? (
        <div className="p-4">
          <LoadError message="The notification queue couldn't be loaded." detail={loadError} onRetry={() => void load()} />
        </div>
      ) : !data?.notifications.length ? (
        <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
          <Mail className="w-7 h-7 opacity-30" aria-hidden />
          No notifications queued yet
        </div>
      ) : (
        <div className="divide-y divide-border/70">
          {data.notifications.map((n) => (
            <div key={n.id} className="px-5 py-3 flex items-center gap-4 hover:bg-muted/50 transition-colors">
              <div className="shrink-0">{NOTIF_STATUS_ICON[n.status] ?? <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/70" />}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground/80 truncate">{n.subject}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="text-primary/70">{n.org_name}</span>
                  {" · "}{n.recipient_email}
                  {" · "}{n.notification_type}
                </div>
                {n.status === "failed" && n.error_message && (
                  <div className="text-xs text-destructive mt-0.5 truncate" title={n.error_message}>{n.error_message}</div>
                )}
              </div>
              {n.status === "failed" && (
                <Button size="sm" variant="ghost" onClick={() => void retry(n.id)} disabled={retrying !== null}
                  aria-label={`Retry email to ${n.recipient_email}`}>
                  <RotateCcw className={`w-3.5 h-3.5 ${retrying === n.id ? "animate-spin" : ""}`} />
                </Button>
              )}
              <div className="text-xs text-muted-foreground shrink-0">{fmtDateTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────────────

export default function AdminSubscriptionsScreen() {
  const { integrations: integrationsEnabled } = usePlatformFeatures();
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [orgs,    setOrgs]    = useState<OrgSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [modal,   setModal]   = useState<ModalState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const getJson = async (res: Response) => {
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as Record<string, unknown> & { plans?: Plan[]; orgs?: Array<Partial<OrgSub> & { id?: string }> };
    };
    try {
      const [plansData, orgsData] = await Promise.all([
        fetch(apiUrl("/api/subscriptions/plans")).then(getJson),
        fetch(apiUrl("/api/platform/orgs?perPage=200"), { headers: withAuthHeaders({}) }).then(getJson),
      ]);
      setPlans(plansData.plans ?? []);
      // /api/platform/orgs returns rows keyed by "id" but OrgSub expects "org_id" —
      // normalize so table row keys + Manage/History modals receive a real org UUID
      setOrgs((orgsData.orgs ?? []).map((o) => ({ ...o, org_id: o.org_id ?? o.id ?? "" }) as OrgSub));
    } catch (e) {
      setLoadError((e as Error).message);
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

  // Additional state for tabs and edit modal
  const [activeTab, setActiveTab] = useState<"organizations" | "plans" | "notifications">("organizations");
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);

  // Helper functions for plan management
  const [mcpConfirmation, setMcpConfirmation] = useState("");
  const [mcpConfirmRequired, setMcpConfirmRequired] = useState(false);
  const savePlan = async (plan: Plan) => {
    setSavingPlan(true);
    setPlanError(null);
    setPlanSuccess(null);
    try {
      if (plan.id === "new") {
        throw new Error("Clara plans are fixed platform tiers. Edit an existing tier to create a new version.");
      }
      const body = {
        planId: plan.id,
        name: plan.name,
        description: plan.description,
        priceUsd: plan.price_usd,
        maxKbs: plan.max_kbs,
        maxDocsPerKb: plan.max_docs_per_kb,
        maxReqDay: plan.max_req_day,
        maxStorageMb: plan.max_storage_mb,
        maxTtsCharsDay: plan.max_tts_chars_day,
        maxSttAudioSecDay: plan.max_stt_audio_sec_day,
        maxTranslationCharsDay: plan.max_translation_chars_day,
        voiceEnabled: plan.voice_enabled,
        apiAccess: plan.api_access,
        customBranding: plan.custom_branding,
        ssoEnabled: plan.sso_enabled,
        analyticsLevel: plan.analytics_level,
        prioritySupport: plan.priority_support,
        features: plan.features,
        multilingualEmbeddings: plan.multilingual_embeddings,
        ...(integrationsEnabled ? {
          mcpEntitlements: plan.mcp_entitlements ?? { ...PLAN_MCP_DISABLED },
          mcpConfirmation: mcpConfirmation.trim().toUpperCase() || undefined,
        } : {}),
      };
      const r = await fetch(apiUrl("/api/platform/subscription-plans"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.code === "CONFIRMATION_REQUIRED") {
          setMcpConfirmRequired(true);
          throw new Error(data.error ?? "Confirmation required");
        }
        if (Array.isArray(data.issues) && data.issues.length) {
          throw new Error(`${data.error ?? "Invalid plan"}: ${data.issues.join("; ")}`);
        }
        throw new Error(data.error ?? "Failed to save plan");
      }

      setPlanSuccess(`Plan ${plan.id === "new" ? "created" : "updated"} successfully`);
      setEditPlan(null);
      setMcpConfirmRequired(false);
      setMcpConfirmation("");
      loadData();
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setSavingPlan(false);
    }
  };

  const publishPlan = async (plan: Plan) => {
    setPlanError(null);
    setPlanSuccess(null);
    try {
      if (!plan.draft_version_id) throw new Error("No draft version exists. Edit and save the plan first.");
      const r = await fetch(apiUrl("/api/platform/subscription-plans"), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ versionId: plan.draft_version_id, action: "publish" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to publish plan");
      
      setPlanSuccess(`Plan published successfully`);
      loadData();
    } catch (e) {
      setPlanError((e as Error).message);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">

      {/* Header with Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">Subscription Management</h1>
          <p className="hidden sm:block text-muted-foreground/70 text-sm mt-0.5">Manage billing across all organisations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData}
            aria-label="Refresh data"
            className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-foreground border border-border hover:border-foreground/20 px-3 py-2 rounded-lg transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {loadError && (
        <LoadError
          message="Subscriptions couldn't be loaded — organisations and revenue below may be incomplete."
          detail={loadError}
          onRetry={() => void loadData()}
        />
      )}

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 rounded-xl p-1">
          <TabsTrigger value="organizations" className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center justify-center gap-1.5 px-1">
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="font-medium truncate">Orgs</span>
            <span className={`hidden sm:inline-block text-xs px-2 py-0.5 rounded-full ${loading ? "bg-muted" : "bg-emerald-500/20 text-emerald-600"}`}>{orgs.length}</span>
          </TabsTrigger>
          <TabsTrigger value="plans" className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center justify-center gap-1.5 px-1">
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="font-medium truncate">Plans</span>
            <span className={`hidden sm:inline-block text-xs px-2 py-0.5 rounded-full ${loading ? "bg-muted" : "bg-primary/10 text-primary"}`}>{plans.length}</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center justify-center gap-1.5 px-1">
            <Bell className="w-4 h-4 shrink-0" />
            <span className="font-medium truncate">Notifs</span>
          </TabsTrigger>
        </TabsList>

        {/* ORGANIZATIONS TAB */}
        <TabsContent value="organizations" className="space-y-6 pt-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "MRR",         value: `${mrr.toLocaleString()}`,  icon: TrendingUp, color: "text-emerald-600" },
              { label: "ARR",         value: `${(mrr*12).toLocaleString()}`, icon: BarChart3, color: "text-primary" },
              { label: "Paying Orgs", value: paying,                       icon: CreditCard, color: "text-sky-600"   },
              { label: "On Trial",    value: trials,                       icon: Gift,       color: "text-amber-600"  },
              { label: "Paused",      value: paused,                       icon: Pause,      color: "text-rose-600"   },
            ].map(s => (
              <div key={s.label} className="border border-border bg-card rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground/70">{s.label}</span>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Plan distribution */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {planDist.map(p => (
              <div key={p.id} className="border border-border bg-card rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_BADGE[p.id] ?? PLAN_BADGE.free}`}>{p.name}</span>
                  <span className="text-lg font-bold text-foreground">{p.count}</span>
                </div>
                <div className="text-xs text-muted-foreground/70">
                  {p.price_usd === -1 ? "Custom pricing" : p.price_usd === 0 ? "Free tier" : `${p.price_usd}/mo each`}
                </div>
                {p.count > 0 && orgs.length > 0 && (
                  <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width:`${(p.count/orgs.length)*100}%`, backgroundColor: PLAN_COLOR[p.id] ?? "#6366f1" }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Org table — desktop table, mobile cards. The 7-column table is
              unusable at 390px; phones get tappable org cards instead. */}
          <div className="border border-border bg-card rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 sm:px-5 py-4 border-b border-border/70 flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-foreground text-sm shrink-0">All Organisations</h2>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 min-w-[140px] max-w-xs bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary/50" />
              <span className="text-xs text-muted-foreground/70 shrink-0">{filtered.length} orgs</span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-xs text-muted-foreground/70 text-left">
                    {["Organisation","Plan","Status","KBs","Queries","Joined","Actions"].map(h => (
                      <th key={h} className="px-5 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {loading
                    ? Array(5).fill(0).map((_,i) => (
                        <tr key={i}>
                          {Array(7).fill(0).map((_,j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}
                        </tr>
                      ))
                    : filtered.map(org => {
                        const status = org.sub_status ?? "free";
                        return (
                          <tr key={org.org_id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-5 py-4">
                              <div className="text-sm font-medium text-foreground">{org.name}</div>
                              <div className="text-xs text-muted-foreground/80 font-mono">{org.slug}</div>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[org.plan_id ?? "free"] ?? PLAN_BADGE.free}`}>
                                {org.plan_id ?? "free"}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[status] ?? "text-muted-foreground bg-muted/50 border-border"}`}>
                                {status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-muted-foreground">{org.kb_count}</td>
                            <td className="px-5 py-4 text-sm text-muted-foreground">{org.query_count.toLocaleString()}</td>
                            <td className="px-5 py-4 text-xs text-muted-foreground/70">{fmtDate(org.created_at)}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setModal({ type:"action", orgId:org.org_id, orgName:org.name, planId:org.plan_id??"free", status })}
                                  className="flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary px-2.5 py-1.5 rounded-lg transition-all">
                                  <CreditCard className="w-3 h-3" /> Manage
                                </button>
                                <button
                                  onClick={() => setModal({ type:"history", orgId:org.org_id, orgName:org.name })}
                                  className="flex items-center gap-1.5 text-xs bg-muted/50 hover:bg-muted border border-border text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg transition-all">
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
                <div className="py-12 text-center text-muted-foreground/80 text-sm">No organisations found</div>
              )}
            </div>

            {/* Mobile org cards */}
            <div className="md:hidden divide-y divide-border/70">
              {loading
                ? Array(4).fill(0).map((_, i) => (
                    <div key={i} className="px-4 py-4 space-y-2.5">
                      <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
                    </div>
                  ))
                : filtered.map(org => {
                    const status = org.sub_status ?? "free";
                    return (
                      <div key={org.org_id} className="px-4 py-4 active:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{org.name}</p>
                            <p className="text-[11px] text-muted-foreground/80 font-mono truncate">{org.slug}</p>
                          </div>
                          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[status] ?? "text-muted-foreground bg-muted/50 border-border"}`}>
                            {status}
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PLAN_BADGE[org.plan_id ?? "free"] ?? PLAN_BADGE.free}`}>
                            {org.plan_id ?? "free"}
                          </span>
                          <span className="text-[11px] text-muted-foreground/70">{org.kb_count} KBs</span>
                          <span className="text-[11px] text-muted-foreground/70">{org.query_count.toLocaleString()} queries</span>
                          <span className="text-[11px] text-muted-foreground/80">{fmtDate(org.created_at)}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => setModal({ type:"action", orgId:org.org_id, orgName:org.name, planId:org.plan_id??"free", status })}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-primary/10 active:bg-primary/20 border border-primary/30 text-primary py-2.5 rounded-xl transition-all">
                            <CreditCard className="w-3.5 h-3.5" /> Manage
                          </button>
                          <button
                            onClick={() => setModal({ type:"history", orgId:org.org_id, orgName:org.name })}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-muted/50 active:bg-muted border border-border text-muted-foreground py-2.5 rounded-xl transition-all">
                            <Receipt className="w-3.5 h-3.5" /> History
                          </button>
                        </div>
                      </div>
                    );
                  })}
              {!loading && !filtered.length && (
                <div className="py-12 text-center text-muted-foreground/80 text-sm">No organisations found</div>
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
              integrationsEnabled={integrationsEnabled}
              onClose={() => setModal(null)}
            />
          )}
        </TabsContent>

        {/* PLANS TAB - Landing page style cards with full editing */}
        <TabsContent value="plans" className="space-y-6 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-foreground">Plan Editions</h2>
              <p className="hidden sm:block text-muted-foreground/70 text-sm mt-0.5">Editions are versioned. Publishing changes future subscriptions; existing customers keep their assigned version. Limits below are enforced by the plan guard.</p>
            </div>
            <div className="text-xs text-muted-foreground/70 rounded-lg border border-border bg-muted/30 px-3 py-2">
              Edit a tier to create a draft version, then publish it.
            </div>
          </div>

          <PlanMultilingualCard plans={plans} onChanged={loadData} />

          {planError && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{planError}</div>}
          {planSuccess && <div className="rounded-lg border border-emerald-600/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">{planSuccess}</div>}

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-80 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl p-4 sm:p-5 text-left flex flex-col transition-all ${plan.id === "pro"
                      ? "glass-premium border-primary/40 shadow-lg shadow-primary/10 relative"
                      : "glass-card"
                    }`}
                >
                  {plan.id === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold text-primary uppercase tracking-wider px-2 py-0.5 bg-primary/10 rounded-full">Most Popular</div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-primary mb-1">{plan.name}</div>
                      <div className="text-xl sm:text-2xl font-black text-foreground mb-1">
                        {plan.price_usd === -1 ? "Custom" : plan.price_usd === 0 ? "Free" : `$${plan.price_usd}/mo`}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground/70">v{plan.published_version ?? 1} · {plan.version_count ?? 1} versions</span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border/70 pt-3">
                    <span>KBs: {plan.max_kbs === -1 ? "∞" : plan.max_kbs}</span>
                    <span>Req/day: {plan.max_req_day === -1 ? "∞" : plan.max_req_day.toLocaleString()}</span>
                    <span>Storage: {plan.max_storage_mb === -1 ? "∞" : plan.max_storage_mb} MB</span>
                    <span>Docs/KB: {plan.max_docs_per_kb === -1 ? "∞" : plan.max_docs_per_kb}</span>
                    <span>TTS/day: {plan.max_tts_chars_day === -1 ? "∞" : plan.max_tts_chars_day.toLocaleString()}</span>
                    <span>STT/day: {plan.max_stt_audio_sec_day === -1 ? "∞" : Math.round(plan.max_stt_audio_sec_day / 60) + " min"}</span>
                    <span>Translation/day: {plan.max_translation_chars_day === -1 ? "∞" : plan.max_translation_chars_day.toLocaleString()}</span>
                  </div>

                  <ul className="space-y-2 flex-1 mb-4 mt-3">
                    {plan.features.slice(0, 5).map((f: string) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                    {plan.features.length > 5 && (
                      <li className="text-xs text-muted-foreground/70 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" />
                        +{plan.features.length - 5} more features
                      </li>
                    )}
                  </ul>

                  <div className="flex gap-2 pt-2 border-t border-border/70">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditPlan(plan)}>
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit Plan
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => void publishPlan(plan)} disabled={!plan.draft_version_id || savingPlan}>
                      <Send className="w-3.5 h-3.5 mr-1.5" /> Publish
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {!plans.length && !loading && (
            <div className="text-center py-12 text-muted-foreground/80">
              <CreditCard className="w-10 h-10 sm:w-12 sm:h-12 mx-auto opacity-30 mb-3" />
              <p>No plans configured yet</p>
              <p className="text-xs text-muted-foreground/70">No platform plan tiers were returned.</p>
            </div>
          )}

          {/* Edit Plan Modal — mobile: bottom sheet; desktop: centered dialog */}
          {editPlan && (
            <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditPlan(null)} />
              <div className="relative max-h-[92dvh] w-full min-w-0 max-w-2xl overflow-y-auto overscroll-contain-y rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
                <div className="sticky top-0 px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-3 bg-card/95 backdrop-blur-sm rounded-t-3xl sm:rounded-t-2xl">
                  <h2 className="text-base font-bold text-foreground truncate">{editPlan.id === "new" ? "Create New Plan" : `Edit: ${editPlan.name}`}</h2>
                  <button onClick={() => setEditPlan(null)} aria-label="Close" className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-muted-foreground/70 hover:text-foreground active:bg-muted transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { field: "name" as const, label: "Plan Name", type: "text" as const, placeholder: "e.g., Pro" },
                      { field: "price_usd" as const, label: "Price (USD/month)", type: "number" as const, placeholder: "0 for free, -1 for custom" },
                      { field: "max_kbs" as const, label: "Max KBs", type: "number" as const, placeholder: "-1 for unlimited" },
                      { field: "max_docs_per_kb" as const, label: "Max Documents per KB", type: "number" as const, placeholder: "-1 for unlimited" },
                      { field: "max_req_day" as const, label: "Max Requests/Day", type: "number" as const, placeholder: "-1 for unlimited" },
                      { field: "max_storage_mb" as const, label: "Max Storage (MB)", type: "number" as const, placeholder: "-1 for unlimited" },
                    ].map(({ field, label, type, placeholder }) => (
                      <label key={field} className="text-xs text-muted-foreground">
                        {label}
                        <input
                          type={type}
                          value={String(editPlan[field])}
                          onChange={e => setEditPlan({ ...editPlan, [field]: type === "number" ? Number(e.target.value) : e.target.value })}
                          placeholder={placeholder}
                          className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                        />
                      </label>
                    ))}
                  </div>

                  <label className="text-xs text-muted-foreground">
                    Description
                    <textarea
                      value={editPlan.description}
                      onChange={e => setEditPlan({ ...editPlan, description: e.target.value })}
                      placeholder="Plan description..."
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none h-20"
                    />
                  </label>

                  <label className="text-xs text-muted-foreground">
                    Features (one per line)
                    <textarea
                      value={editPlan.features.join("\n")}
                      onChange={e => setEditPlan({ ...editPlan, features: e.target.value.split("\n").map(f => f.trim()).filter(Boolean) })}
                      placeholder="Feature 1\nFeature 2\nFeature 3"
                      className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none h-32 font-mono text-xs"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {[
                      { field: "voice_enabled" as const, label: "Voice Enabled" },
                      { field: "api_access" as const, label: "API Access" },
                      { field: "custom_branding" as const, label: "Custom Branding" },
                      { field: "sso_enabled" as const, label: "SSO Enabled" },
                      { field: "priority_support" as const, label: "Priority Support" },
                    ].map(({ field, label }) => (
                      <label key={field} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editPlan[field]}
                          onChange={e => setEditPlan({ ...editPlan, [field]: e.target.checked })}
                          className="rounded border-border text-primary focus:ring-primary/20"
                        />
                        <span className="text-sm text-muted-foreground">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-muted-foreground">
                      Analytics Level
                      <select
                        value={editPlan.analytics_level}
                        onChange={e => setEditPlan({ ...editPlan, analytics_level: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                      >
                        <option value="basic">Basic</option>
                        <option value="standard">Standard</option>
                        <option value="advanced">Advanced</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Version Note
                      <input
                        type="text"
                        value={planSuccess || ""}
                        onChange={e => setPlanSuccess(e.target.value)}
                        placeholder="What changed in this version?"
                        className="mt-1 w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                      />
                    </label>
                  </div>

                  {/* MCP plan entitlements — centralized validation on save */}
                  {integrationsEnabled && mcpConfirmRequired && (
                    <div role="alert" className="rounded-xl border border-amber-600/30 bg-amber-500/5 p-3 space-y-2">
                      <p className="text-xs text-amber-700">
                        Disabling MCP for this plan blocks new MCP operations for its
                        subscribers immediately. Existing connections are preserved but
                        stop working. Type <span className="font-mono font-semibold">DISABLE-PLAN-MCP</span> to confirm.
                      </p>
                      <input
                        type="text"
                        value={mcpConfirmation}
                        onChange={e => setMcpConfirmation(e.target.value)}
                        placeholder="DISABLE-PLAN-MCP"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  )}
                  {integrationsEnabled && (
                    <PlanMcpEntitlementsEditor
                      value={editPlan.mcp_entitlements ?? { ...PLAN_MCP_DISABLED }}
                      onChange={mcp => setEditPlan({ ...editPlan, mcp_entitlements: mcp })}
                    />
                  )}

                  <div className="flex gap-2 pt-4 border-t border-border/70">
                    <Button size="sm" variant="outline" onClick={() => setEditPlan(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => void savePlan(editPlan)} disabled={savingPlan || !editPlan.name.trim()}>
                      <Check className="w-3.5 h-3.5 mr-1.5" /> {editPlan.id === "new" ? "Create Plan" : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications" className="space-y-6 pt-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">Email Notification Queue</h2>
            <p className="text-muted-foreground/70 text-sm mt-0.5">Monitor and manage queued email notifications</p>
          </div>
          <NotificationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── BillingHistoryDrawer (moved below main, order doesn’t matter in TS) ──────

function BillingHistoryDrawer({ orgId, orgName, onClose, integrationsEnabled }: {
  orgId: string; orgName: string; onClose: () => void;
  integrationsEnabled: boolean;
}) {
  const [data, setData] = useState<{ invoices: BillingEvent[]; auditLog: AuditEntry[] } | null>(null);
  const [tab, setTab]   = useState<"invoices" | "audit" | "mcp">("invoices");
  const visibleTab = !integrationsEnabled && tab === "mcp" ? "invoices" : tab;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl(`/api/orgs/billing-history?orgId=${orgId}`), { headers: withAuthHeaders({}) })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [orgId]);

  const GATEWAY_BADGE: Record<string, string> = {
    stripe:    "bg-primary/10 text-primary",
    razorpay:  "bg-sky-500/10 text-sky-600",
    manual:    "bg-muted text-muted-foreground",
  };
  const STATUS_DOT: Record<string, string> = {
    paid:     "bg-emerald-400",
    pending:  "bg-amber-400",
    failed:   "bg-rose-400",
    refunded: "bg-slate-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end pl-2 sm:pl-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-dvh max-h-dvh w-full min-w-0 max-w-[min(100vw,32rem)] overflow-hidden border-l border-border bg-card shadow-2xl flex flex-col">

        {/* Drawer header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Billing History</h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5">{orgName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(integrationsEnabled ? ["invoices","audit","mcp"] as const : ["invoices","audit"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-xs font-medium py-2.5 capitalize transition-all border-b-2 -mb-px flex items-center justify-center gap-1.5
                ${visibleTab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground/70 hover:text-foreground"}`}>
              {t === "invoices" ? <><Receipt className="w-3.5 h-3.5" /> Payment Events</> : t === "audit" ? <><Shield className="w-3.5 h-3.5" /> Audit Log</> : <><Cable className="w-3.5 h-3.5" /> MCP</>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {integrationsEnabled && visibleTab === "mcp" ? (
            <PlatformOrgMcpEntitlementsPanel orgId={orgId} />
          ) : loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground/70 text-sm">Loading…</div>
          ) : visibleTab === "invoices" ? (
            !data?.invoices.length ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/80 text-sm gap-2">
                <Receipt className="w-8 h-8 opacity-30" /> No billing events yet
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {data.invoices.map(ev => (
                  <div key={ev.id} className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${GATEWAY_BADGE[ev.gateway] ?? "bg-muted text-muted-foreground"}`}>
                            {ev.gateway}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">{ev.event_type}</span>
                        </div>
                        <div className="text-xs text-muted-foreground/70">{fmtDateTime(ev.created_at)}</div>
                        {ev.plan_id && <div className="text-xs text-primary/70 mt-0.5">Plan: {ev.plan_id}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-foreground">{fmtAmount(ev.amount_cents, ev.amount_paise, ev.currency)}</div>
                        <div className="flex items-center gap-1.5 mt-1 justify-end">
                          <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ev.status] ?? "bg-slate-400"}`} />
                          <span className="text-xs text-muted-foreground/70 capitalize">{ev.status}</span>
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
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/80 text-sm gap-2">
                <Shield className="w-8 h-8 opacity-30" /> No audit events yet
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {data.auditLog.map(entry => (
                  <div key={entry.id} className="px-4 sm:px-6 py-3 sm:py-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-muted/50 border border-border flex items-center justify-center shrink-0 mt-0.5">
                        {AUDIT_ACTION_ICON[entry.action] ?? <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-foreground capitalize">{entry.action.replace(/_/g," ")}</span>
                          <span className="text-xs text-muted-foreground/80 capitalize">by {entry.actor_label}</span>
                        </div>
                        {(entry.old_plan_id || entry.new_plan_id) && (
                          <div className="text-xs text-muted-foreground/70 flex items-center gap-1.5 mb-0.5">
                            {entry.old_plan_id && <span className="text-muted-foreground">{entry.old_plan_id}</span>}
                            {entry.old_plan_id && entry.new_plan_id && <ChevronRight className="w-3 h-3" />}
                            {entry.new_plan_id && <span className="text-primary">{entry.new_plan_id}</span>}
                          </div>
                        )}
                        {(entry.old_status || entry.new_status) && (
                          <div className="text-xs text-muted-foreground/70 flex items-center gap-1.5 mb-0.5">
                            {entry.old_status && <span className="text-muted-foreground/70">{entry.old_status}</span>}
                            {entry.old_status && entry.new_status && <ChevronRight className="w-3 h-3" />}
                            {entry.new_status && <span className="text-emerald-600/80">{entry.new_status}</span>}
                          </div>
                        )}
                        {entry.note && <p className="text-xs text-muted-foreground/70 italic mt-0.5">&ldquo;{entry.note}&rdquo;</p>}
                        <div className="text-xs text-muted-foreground/80 mt-1">{fmtDateTime(entry.created_at)}</div>
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

/**
 * Multilingual knowledge index per plan (platform admin). Organisations on a
 * plan with it enabled can re-index their knowledge bases with the
 * multilingual E5 model once Settings → AI → Multilingual knowledge index is on.
 */
function PlanMultilingualCard({ plans, onChanged }: { plans: Plan[]; onChanged: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (plan: Plan, enabled: boolean) => {
    setSaving(plan.id);
    setError(null);
    try {
      const r = await fetch(apiUrl("/api/platform/subscription-plans"), {
        method: "PATCH",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "multilingual", planId: plan.id, enabled }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Could not update the plan");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };
  if (plans.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-semibold text-foreground">Multilingual knowledge index</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Which plans may re-index knowledge bases with the multilingual E5 model (ElevenLabs-grade multilingual retrieval).
        The platform switch and endpoint live in Settings → AI.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {plans.map((plan) => {
          const on = Boolean(plan.multilingual_embeddings);
          return (
            <label
              key={plan.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={on}
                disabled={saving === plan.id}
                onChange={(e) => void toggle(plan, e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary/20"
              />
              {plan.name}
            </label>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
