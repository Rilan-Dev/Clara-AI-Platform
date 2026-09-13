"use client";

/**
 * src/features/admin/screens/org-billing-screen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Billing & Plan — the money tab of the org workspace.
 *
 *   1. Current plan card — status, renewal date, gateway, renew CTA
 *   2. Usage meters      — live usage vs plan limits (upgrade pressure)
 *   3. Plans grid        — upgrade / renew / downgrade paths
 *                          · org users pay via Razorpay (Starter / Pro)
 *                          · Enterprise → contact sales
 *                          · super-admins change plans directly (no payment)
 *   4. Billing history   — payments + subscription changes
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, BadgeCheck, Check, CreditCard, FileClock, Loader2,
  RefreshCw, ShieldAlert, Sparkles, Zap,
} from "lucide-react";
import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";
import { useAuth } from "@/modules/admin-ui/hooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OrgWorkspaceNav } from "@/components/admin/OrgWorkspaceNav";
import { Button } from "@/components/ui/button";

type SubData = {
  subscription: {
    plan_id: string; plan_name: string; status: string; gateway: string | null;
    current_period_end: string | null; current_period_start: string | null;
    cancel_at_period_end: boolean; price_usd: number;
    max_kbs: number; max_docs_per_kb: number; max_req_day: number; max_storage_mb: number;
    features: string[];
  };
  effective: {
    planId: string; planName: string; effectiveStatus: string;
    currentPeriodEnd: string | null; daysRemaining: number | null;
    needsRenewal: boolean; needsAttention: boolean;
  } | null;
  usage: { kb_count: number; requests_today: number; storage_bytes: number };
};

type Plan = {
  id: string; name: string; description: string; price_usd: number;
  max_kbs: number; max_req_day: number; features: string[];
};

type HistoryData = {
  invoices: {
    id: string; gateway: string; event_type: string; plan_id: string | null;
    amount_paise: number | null; amount_cents: number | null; currency: string;
    status: string; created_at: string;
  }[];
  auditLog: {
    id: string; actor_label: string; action: string; old_plan_id: string | null;
    new_plan_id: string | null; note: string | null; created_at: string;
  }[];
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (opts: Record<string, any>) => { open(): void };
  }
}

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatINR(paise: number | null): string {
  if (paise == null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  trialing:  { label: "Trial",     cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  expiring:  { label: "Renews soon", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  expired:   { label: "Expired",   cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  past_due:  { label: "Past due",  cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  paused:    { label: "Paused",    cls: "bg-white/10 text-white/60 border-white/15" },
  cancelled: { label: "Cancelled", cls: "bg-white/10 text-white/50 border-white/15" },
  inactive:  { label: "Inactive",  cls: "bg-white/10 text-white/50 border-white/15" },
};

// ── Usage meter ───────────────────────────────────────────────────────────────

function UsageMeter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = !unlimited && used > limit;
  const near = !unlimited && !over && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-white/50">{label}</span>
        <span className={`text-xs font-medium ${over ? "text-rose-400" : near ? "text-amber-300" : "text-white/70"}`}>
          {used.toLocaleString()}{unit ? ` ${unit}` : ""} / {unlimited ? "Unlimited" : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            over ? "bg-rose-500" : near ? "bg-amber-400" : "bg-gradient-to-r from-indigo-500 to-violet-500"
          }`}
          style={{ width: over ? "100%" : `${pct}%` }}
        />
      </div>
      {over && (
        <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Over the plan limit — upgrade to continue smoothly
        </p>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OrgBillingScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const { user }   = useAuth();
  const isAdmin    = user?.isSuperAdmin ?? false;

  const [sub, setSub]             = useState<SubData | null>(null);
  const [plans, setPlans]         = useState<Plan[]>([]);
  const [history, setHistory]     = useState<HistoryData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [paying, setPaying]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [message, setMessage]     = useState<string | null>(null);

  // Razorpay Checkout.js
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([
      fetch(apiUrl(`/api/orgs/subscription?orgId=${id}`), { headers: withAuthHeaders() }).then((r) => r.json()),
      fetch(apiUrl("/api/subscriptions/plans")).then((r) => r.json()),
      fetch(apiUrl(`/api/orgs/billing-history?orgId=${id}&limit=25`), { headers: withAuthHeaders() })
        .then((r) => (r.ok ? r.json() : { invoices: [], auditLog: [] })),
    ])
      .then(([s, p, h]) => {
        setSub(s);
        setPlans(p.plans ?? []);
        setHistory(h);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Renew / upgrade via Razorpay (org users) ───────────────────────────────
  async function handlePay(planId: string) {
    setPaying(planId); setError(null); setMessage(null);
    try {
      const res = await fetch(apiUrl("/api/subscriptions/razorpay/order"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId: id, planId }),
      });
      const order = await res.json() as {
        orderId: string; amount: number; currency: string; keyId: string;
        planName: string; userEmail?: string; userName?: string; error?: string;
      };
      if (!res.ok) throw new Error(order.error ?? `HTTP ${res.status}`);
      if (!window.Razorpay) throw new Error("Razorpay is still loading — try again in a few seconds.");

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Clara AI",
        description: order.planName,
        order_id: order.orderId,
        prefill: { email: order.userEmail ?? "", name: order.userName ?? "" },
        theme: { color: "#6366f1" },
        handler: async (response: {
          razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string;
        }) => {
          const vRes = await fetch(apiUrl("/api/subscriptions/razorpay/verify"), {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ ...response, orgId: id, planId }),
          });
          const vData = await vRes.json() as { ok?: boolean; error?: string; message?: string };
          if (!vRes.ok) { setError(vData.error ?? "Payment verification failed"); return; }
          setMessage(vData.message ?? "Subscription activated!");
          load();
        },
        modal: { ondismiss: () => setPaying(null) },
      });
      rzp.open();
    } catch (e: unknown) {
      setError((e as Error).message);
      setPaying(null);
    }
  }

  // ── Super-admin: direct plan change ────────────────────────────────────────
  async function handleAdminPlanChange(planId: string) {
    setPaying(planId); setError(null); setMessage(null);
    try {
      const res = await fetch(apiUrl("/api/orgs/subscription"), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orgId: id, planId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update plan");
      setMessage(`Plan changed to ${planId}. The organisation owner was notified by email.`);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

  const eff        = sub?.effective;
  const currentPlan = eff?.planId ?? sub?.subscription?.plan_id ?? "free";
  const statusInfo = STATUS_STYLES[eff?.effectiveStatus ?? sub?.subscription?.status ?? "inactive"] ?? STATUS_STYLES.inactive!;
  const needsRenew = eff?.needsRenewal ?? false;
  const usage      = sub?.usage;
  const s          = sub?.subscription;

  return (
    <div className="p-6 lg:p-8">
      <AdminPageHeader
        icon={CreditCard}
        title="Billing & Plan"
        description={isAdmin
          ? "Change this organisation's plan directly, or let the owner self-serve."
          : "Your plan, what it includes, and how much of it you're using."}
        breadcrumbs={isAdmin ? [{ label: "Organisations", href: "/orgs" }, { label: "Billing" }] : undefined}
      />

      <OrgWorkspaceNav orgId={id} />

      {(message || error) && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
          error ? "border-rose-500/25 bg-rose-500/10 text-rose-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
        }`}>
          {error ?? message}
        </div>
      )}

      {/* Renewal alert banner */}
      {needsRenew && eff && (
        <div className={`mb-6 rounded-2xl border px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
          eff.effectiveStatus === "expired"
            ? "border-rose-500/30 bg-rose-500/[0.08]"
            : "border-amber-500/30 bg-amber-500/[0.08]"
        }`}>
          <div className="flex items-start gap-3">
            <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${eff.effectiveStatus === "expired" ? "text-rose-400" : "text-amber-400"}`} />
            <div>
              <p className="font-semibold text-white">
                {eff.effectiveStatus === "expired" ? "Subscription expired" : `Renewal due in ${eff.daysRemaining} days`}
              </p>
              <p className="text-sm text-white/50 mt-0.5">
                {eff.effectiveStatus === "expired"
                  ? `Ended ${formatDate(eff.currentPeriodEnd)} — renew below to restore full access instantly.`
                  : `Ends ${formatDate(eff.currentPeriodEnd)} — renew below to avoid any interruption.`}
              </p>
            </div>
          </div>
          {!isAdmin && (currentPlan === "starter" || currentPlan === "pro") && (
            <Button onClick={() => handlePay(currentPlan)} disabled={paying === currentPlan}
              className="gap-2 shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
              {paying === currentPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Renew {eff.planName}
            </Button>
          )}
        </div>
      )}

      {/* Current plan + usage meters */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Current plan</p>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white">{s?.plan_name ?? "Free"}</h2>
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${statusInfo.cls}`}>
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-sm text-white/40 mt-1.5">
                {s?.price_usd && s.price_usd > 0 ? `$${s.price_usd}/mo` : s?.price_usd === -1 ? "Custom pricing" : "No cost"}
                {eff?.effectiveStatus === "active" && eff.currentPeriodEnd && ` · renews ${formatDate(eff.currentPeriodEnd)}`}
                {s?.gateway && s.gateway !== "manual" && ` · via ${s.gateway}`}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
              <BadgeCheck className="w-5 h-5 text-indigo-300" />
            </div>
          </div>

          {(s?.features ?? []).length > 0 && (
            <ul className="space-y-1.5">
              {(s!.features as string[]).slice(0, 6).map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white text-sm">Usage this period</h3>
            <button onClick={load} className="text-white/30 hover:text-white/60 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="space-y-4">
            <UsageMeter label="Knowledge bases" used={usage?.kb_count ?? 0} limit={s?.max_kbs ?? 1} />
            <UsageMeter label="Requests today" used={usage?.requests_today ?? 0} limit={s?.max_req_day ?? 100} />
            <UsageMeter
              label="Storage"
              used={Math.round((usage?.storage_bytes ?? 0) / 1_048_576)}
              limit={s?.max_storage_mb ?? 100}
              unit="MB"
            />
          </div>
        </div>
      </div>

      {/* Plans grid */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">Plans</h3>
            <p className="text-sm text-white/40 mt-0.5">
              {isAdmin ? "Switch this organisation's plan (billed internally)." : "Upgrade, renew or change your plan at any time."}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isUpgrade = (PLAN_RANK[plan.id] ?? 0) > (PLAN_RANK[currentPlan] ?? 0);
            const isRenew   = plan.id === currentPlan && needsRenew;
            const highlight = isRenew || (isUpgrade && ["starter", "pro"].includes(plan.id));

            return (
              <div key={plan.id} className={`relative rounded-2xl border p-5 flex flex-col ${
                isCurrent
                  ? "border-indigo-500/50 bg-indigo-600/[0.08]"
                  : highlight
                    ? "border-violet-500/30 bg-violet-500/[0.05]"
                    : "border-white/[0.08] bg-white/[0.02]"
              }`}>
                {isRenew && (
                  <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-black px-2 py-0.5 rounded-full">
                    Renew now
                  </span>
                )}
                {isUpgrade && !isCurrent && ["starter", "pro"].includes(plan.id) && (
                  <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase tracking-wide bg-violet-500 text-white px-2 py-0.5 rounded-full">
                    Best value
                  </span>
                )}

                <div className="mb-3">
                  <h4 className="font-bold text-white">{plan.name}</h4>
                  <p className="text-sm text-white/40 mt-0.5">{plan.description}</p>
                </div>
                <div className="text-2xl font-black text-white mb-1">
                  {plan.price_usd === -1 ? "Custom" : plan.price_usd === 0 ? "Free" : `$${plan.price_usd}`}
                  {plan.price_usd > 0 && <span className="text-sm font-normal text-white/40">/mo</span>}
                </div>

                <ul className="flex-1 space-y-1.5 mt-3 min-h-[84px]">
                  {(plan.features ?? []).slice(0, 5).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-white/55">
                      <Check className="w-3.5 h-3.5 text-emerald-400/70 shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  {isCurrent && !needsRenew ? (
                    <div className="w-full text-center text-xs text-indigo-300 font-medium py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25">
                      Current plan
                    </div>
                  ) : isAdmin ? (
                    <Button
                      variant={isRenew ? "default" : "outline"}
                      className="w-full gap-2"
                      disabled={paying === plan.id}
                      onClick={() => handleAdminPlanChange(plan.id)}
                    >
                      {paying === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {isRenew ? "Reactivate" : `Set ${plan.name}`}
                    </Button>
                  ) : plan.id === "enterprise" ? (
                    <a
                      href="mailto:sales@clara.ai?subject=Clara%20AI%20Enterprise%20plan"
                      className="block w-full text-center text-sm font-medium py-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
                    >
                      Contact sales
                    </a>
                  ) : plan.id === "free" ? (
                    <div className="w-full text-center text-xs text-white/30 py-2.5 rounded-xl border border-white/[0.06]">
                      {isUpgrade ? "" : "Included by default"}
                    </div>
                  ) : (
                    <Button
                      className="w-full gap-2"
                      variant={isRenew ? "default" : "outline"}
                      disabled={paying === plan.id}
                      onClick={() => handlePay(plan.id)}
                    >
                      {paying === plan.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : isRenew ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                      {isRenew ? `Renew ${plan.name}` : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!isAdmin && (
          <p className="mt-4 text-xs text-white/30 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400/60" />
            Payments are processed securely by Razorpay. Need a different payment method or the Enterprise plan?
            <a href="mailto:sales@clara.ai" className="text-indigo-400/80 hover:text-indigo-300">Talk to sales</a>.
          </p>
        )}
      </div>

      {/* Billing history */}
      <div className="mt-8 border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileClock className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-white text-sm">Billing history</h3>
        </div>

        {history && history.invoices.length > 0 ? (
          <div className="space-y-2">
            {history.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-white capitalize">
                    {inv.event_type.replace(/[._]/g, " ")} · <span className="text-white/50">{inv.plan_id ?? "—"}</span>
                  </p>
                  <p className="text-[11px] text-white/30">
                    {formatDate(inv.created_at)} · {inv.gateway}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-white">
                    {inv.amount_paise ? formatINR(inv.amount_paise) : inv.amount_cents ? `$${(inv.amount_cents / 100).toFixed(2)}` : "—"}
                  </div>
                  <div className={`text-[11px] ${inv.status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>
                    {inv.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : history && history.auditLog.length > 0 ? (
          <div className="space-y-2">
            {history.auditLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-white capitalize">
                    {entry.action.replace(/[._]/g, " ")}
                    {entry.old_plan_id && entry.new_plan_id && ` · ${entry.old_plan_id} → ${entry.new_plan_id}`}
                  </p>
                  {entry.note && <p className="text-[11px] text-white/30 truncate">{entry.note}</p>}
                </div>
                <span className="text-[11px] text-white/30 shrink-0">{formatDate(entry.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/35 py-6 text-center">
            No billing activity yet — your payment and plan history will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
