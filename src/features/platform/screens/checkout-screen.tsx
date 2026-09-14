"use client";
/**
 * CheckoutScreen
 * ─────────────────────────────────────────────────────────────────────────────
 * Gateway selector + checkout orchestrator.
 *
 * URL params:
 *   ?plan=starter|pro   — required
 *   ?orgId=UUID         — required (set after signup creates the org)
 *
 * Flow A — Stripe (USD):
 *   POST /api/subscriptions/checkout → { url } → window.location.href = url
 *   Stripe hosted page → redirects to /checkout/success?session_id=…&orgId=…&plan=…
 *
 * Flow B — Razorpay (INR):
 *   POST /api/subscriptions/razorpay/order → { orderId, amount, keyId, … }
 *   Open Razorpay modal → on handler success
 *   POST /api/subscriptions/razorpay/verify → router.push /checkout/success
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Brain, CreditCard, Zap, Check, AlertCircle,
  ArrowLeft, Shield, Lock, ChevronRight, Info,
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

// ── Plan metadata ─────────────────────────────────────────────────────────────

type PlanInfo = {
  name: string; usd: string; inr: string;
  badge?: string; color: string; features: string[];
};
const PLANS: Record<string, PlanInfo> = {
  starter: {
    name: "Starter", usd: "$49/mo", inr: "₹4,000/mo",
    color: "border-cyan-500/30 bg-cyan-500/[0.04]",
    features: ["3 Knowledge Bases", "50 docs per KB", "1,000 req/day", "Voice AI", "Full analytics"],
  },
  pro: {
    name: "Pro", usd: "$149/mo", inr: "₹12,000/mo", badge: "Most popular",
    color: "border-indigo-500/40 bg-indigo-600/[0.07]",
    features: ["10 KBs", "200 docs/KB", "10,000 req/day", "Advanced analytics", "Custom branding", "Priority support"],
  },
};

type Gateway = "stripe" | "razorpay";

// Razorpay Checkout.js type shim
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (opts: Record<string, any>) => { open(): void };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckoutScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const planId = searchParams.get("plan") ?? "starter";
  const orgId  = searchParams.get("orgId") ?? "";

  const [gateway, setGateway] = useState<Gateway>("stripe");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const plan = PLANS[planId] ?? PLANS.starter!;

  // Inject Razorpay Checkout.js once
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  // ── Stripe flow ──────────────────────────────────────────────────────────
  async function handleStripe() {
    setLoading(true); setError("");
    try {
      const res  = await fetch(apiUrl("/api/subscriptions/checkout"), {
        method:  "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ orgId, planId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.url) window.location.href = data.url;
    } catch (e: unknown) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  // ── Razorpay flow ────────────────────────────────────────────────────────
  async function handleRazorpay() {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiUrl("/api/subscriptions/razorpay/order"), {
        method:  "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body:    JSON.stringify({ orgId, planId }),
      });
      const order = await res.json() as {
        orderId: string; amount: number; currency: string;
        keyId: string; planName: string;
        userEmail?: string; userName?: string; error?: string;
      };
      if (!res.ok) throw new Error(order.error ?? `HTTP ${res.status}`);
      if (!window.Razorpay) throw new Error("Razorpay SDK not loaded — please refresh.");

      const rzp = new window.Razorpay({
        key:         order.keyId,
        amount:      order.amount,
        currency:    order.currency,
        name:        "Clara AI",
        description: order.planName,
        order_id:    order.orderId,
        prefill:     { email: order.userEmail ?? "", name: order.userName ?? "" },
        theme:       { color: "#6366f1" },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const vRes = await fetch(apiUrl("/api/subscriptions/razorpay/verify"), {
            method:  "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body:    JSON.stringify({ ...response, orgId, planId }),
          });
          const vData = await vRes.json() as { ok?: boolean; error?: string };
          if (!vRes.ok) { setError(vData.error ?? "Verification failed"); setLoading(false); return; }
          router.push(`/checkout/success?orgId=${orgId}&plan=${planId}&gateway=razorpay`);
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (e: unknown) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  function handleCheckout() {
    if (gateway === "stripe")   handleStripe();
    else                        handleRazorpay();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 py-10 sm:py-20 flex items-start justify-center">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Clara AI</span>
          </Link>
          <h1 className="text-2xl font-black text-white mb-1">Complete your subscription</h1>
          <p className="text-white/40 text-sm">Cancel anytime · No hidden fees</p>
        </div>

        {/* Plan summary */}
        <div className={`border rounded-2xl p-5 mb-5 ${plan.color}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{plan.name} Plan</span>
                {plan.badge && (
                  <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                    {plan.badge}
                  </span>
                )}
              </div>
              <div className="text-xs text-white/40 mt-0.5">Clara AI Platform</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black text-white">
                {gateway === "razorpay" ? plan.inr : plan.usd}
              </div>
              <div className="text-xs text-white/30">billed now</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 border-t border-white/[0.06]">
            {plan.features.map(f => (
              <span key={f} className="text-xs text-white/50 flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-400" />{f}
              </span>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30
                          text-rose-300 text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Missing orgId warning */}
        {!orgId && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30
                          text-amber-300 text-xs rounded-xl px-4 py-3 mb-4">
            <Info className="w-4 h-4 shrink-0" />
            Organisation ID is missing. Please complete signup first.
          </div>
        )}

        {/* Gateway selector + pay button */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5">

          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
            Choose payment method
          </p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {/* Stripe */}
            <button onClick={() => setGateway("stripe")}
              className={`flex flex-col items-center gap-2.5 border rounded-xl p-4 transition-all
                ${gateway === "stripe"
                  ? "border-indigo-500 bg-indigo-600/10 ring-2 ring-indigo-500/50"
                  : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <CreditCard className={`w-6 h-6 ${gateway === "stripe" ? "text-indigo-400" : "text-white/25"}`} />
              <div className="text-center">
                <div className={`text-sm font-bold ${gateway === "stripe" ? "text-white" : "text-white/40"}`}>
                  Stripe
                </div>
                <div className="text-[11px] text-white/30 mt-0.5">USD · Cards</div>
              </div>
              {gateway === "stripe" && (
                <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>

            {/* Razorpay */}
            <button onClick={() => setGateway("razorpay")}
              className={`flex flex-col items-center gap-2.5 border rounded-xl p-4 transition-all
                ${gateway === "razorpay"
                  ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/50"
                  : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <Zap className={`w-6 h-6 ${gateway === "razorpay" ? "text-cyan-400" : "text-white/25"}`} />
              <div className="text-center">
                <div className={`text-sm font-bold ${gateway === "razorpay" ? "text-white" : "text-white/40"}`}>
                  Razorpay
                </div>
                <div className="text-[11px] text-white/30 mt-0.5">INR · UPI</div>
              </div>
              {gateway === "razorpay" && (
                <div className="w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          </div>

          {/* Gateway info strip */}
          <div className="bg-white/[0.03] rounded-xl px-4 py-3 mb-4 space-y-1.5">
            {gateway === "stripe" ? (
              <>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Lock className="w-3 h-3 text-indigo-400" />
                  Secured by Stripe — PCI DSS Level 1 certified
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Shield className="w-3 h-3 text-indigo-400" />
                  Visa · Mastercard · Amex · Apple Pay · Google Pay
                </div>
                <div className="text-xs text-white/50 pt-1 border-t border-white/[0.06]">
                  Billed in <span className="text-white font-semibold">USD</span> — {plan.usd}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Lock className="w-3 h-3 text-cyan-400" />
                  Secured by Razorpay — PCI DSS compliant
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Shield className="w-3 h-3 text-cyan-400" />
                  UPI · Net Banking · Cards · Wallets · EMI
                </div>
                <div className="text-xs text-white/50 pt-1 border-t border-white/[0.06]">
                  Billed in <span className="text-white font-semibold">INR</span> — {plan.inr}
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleCheckout}
            disabled={loading || !orgId}
            className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2
              transition-all disabled:opacity-50 disabled:cursor-not-allowed
              ${gateway === "razorpay"
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>
            {loading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
              : <>{gateway === "stripe" ? "Continue to Stripe" : "Continue to Razorpay"} <ChevronRight className="w-4 h-4" /></>
            }
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 space-y-2">
          <p className="text-xs text-white/20">
            By proceeding you agree to our{" "}
            <Link href="/terms" className="text-indigo-400/70 hover:text-indigo-300">Terms</Link>{" "}and{" "}
            <Link href="/privacy" className="text-indigo-400/70 hover:text-indigo-300">Privacy Policy</Link>.
          </p>
          <Link href={`/signup?plan=${planId}`}
            className="inline-flex items-center gap-1 text-xs text-white/20 hover:text-white/50 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to signup
          </Link>
        </div>
      </div>
    </div>
  );
}
