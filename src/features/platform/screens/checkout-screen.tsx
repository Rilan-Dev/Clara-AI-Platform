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
    color: "border-cyan-500/30 bg-cyan-500/[0.06]",
    features: ["3 Knowledge Bases", "50 docs per KB", "1,000 req/day", "Voice AI", "Full analytics"],
  },
  pro: {
    name: "Pro", usd: "$149/mo", inr: "₹12,000/mo", badge: "Most popular",
    color: "border-primary/40 bg-primary/5",
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
    <div className="min-h-screen bg-background px-4 py-10 sm:py-20 flex items-start justify-center">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-foreground text-lg">Clara AI</span>
          </Link>
          <h1 className="text-2xl font-black text-foreground mb-1">Complete your subscription</h1>
          <p className="text-muted-foreground text-sm">Cancel anytime · No hidden fees</p>
        </div>

        {/* Plan summary */}
        <div className={`border rounded-2xl p-5 mb-5 ${plan.color}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{plan.name} Plan</span>
                {plan.badge && (
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {plan.badge}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Clara AI Platform</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black text-foreground">
                {gateway === "razorpay" ? plan.inr : plan.usd}
              </div>
              <div className="text-xs text-muted-foreground/70">billed now</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 border-t border-border">
            {plan.features.map(f => (
              <span key={f} className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />{f}
              </span>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/30
                          text-destructive text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Missing orgId warning */}
        {!orgId && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30
                          text-amber-600 text-xs rounded-xl px-4 py-3 mb-4">
            <Info className="w-4 h-4 shrink-0" />
            Organisation ID is missing. Please complete signup first.
          </div>
        )}

        {/* Gateway selector + pay button */}
        <div className="border border-border bg-card rounded-2xl p-5">

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Choose payment method
          </p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {/* Stripe */}
            <button onClick={() => setGateway("stripe")}
              className={`flex flex-col items-center gap-2.5 border rounded-xl p-4 transition-all
                ${gateway === "stripe"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/50"
                  : "border-border bg-card hover:bg-muted/50"}`}>
              <CreditCard className={`w-6 h-6 ${gateway === "stripe" ? "text-primary" : "text-muted-foreground/50"}`} />
              <div className="text-center">
                <div className={`text-sm font-bold ${gateway === "stripe" ? "text-foreground" : "text-muted-foreground"}`}>
                  Stripe
                </div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">USD · Cards</div>
              </div>
              {gateway === "stripe" && (
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>

            {/* Razorpay */}
            <button onClick={() => setGateway("razorpay")}
              className={`flex flex-col items-center gap-2.5 border rounded-xl p-4 transition-all
                ${gateway === "razorpay"
                  ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/50"
                  : "border-border bg-card hover:bg-muted/50"}`}>
              <Zap className={`w-6 h-6 ${gateway === "razorpay" ? "text-cyan-600" : "text-muted-foreground/50"}`} />
              <div className="text-center">
                <div className={`text-sm font-bold ${gateway === "razorpay" ? "text-foreground" : "text-muted-foreground"}`}>
                  Razorpay
                </div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">INR · UPI</div>
              </div>
              {gateway === "razorpay" && (
                <div className="w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          </div>

          {/* Gateway info strip */}
          <div className="bg-muted/50 rounded-xl px-4 py-3 mb-4 space-y-1.5">
            {gateway === "stripe" ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="w-3 h-3 text-primary" />
                  Secured by Stripe — PCI DSS Level 1 certified
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3 text-primary" />
                  Visa · Mastercard · Amex · Apple Pay · Google Pay
                </div>
                <div className="text-xs text-muted-foreground pt-1 border-t border-border">
                  Billed in <span className="text-foreground font-semibold">USD</span> — {plan.usd}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="w-3 h-3 text-cyan-600" />
                  Secured by Razorpay — PCI DSS compliant
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3 text-cyan-600" />
                  UPI · Net Banking · Cards · Wallets · EMI
                </div>
                <div className="text-xs text-muted-foreground pt-1 border-t border-border">
                  Billed in <span className="text-foreground font-semibold">INR</span> — {plan.inr}
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
                : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
            {loading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
              : <>{gateway === "stripe" ? "Continue to Stripe" : "Continue to Razorpay"} <ChevronRight className="w-4 h-4" /></>
            }
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 space-y-2">
          <p className="text-xs text-muted-foreground/50">
            By proceeding you agree to our{" "}
            <Link href="/terms" className="text-primary/70 hover:text-primary">Terms</Link>{" "}and{" "}
            <Link href="/privacy" className="text-primary/70 hover:text-primary">Privacy Policy</Link>.
          </p>
          <Link href={`/signup?plan=${planId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-foreground/80 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to signup
          </Link>
        </div>
      </div>
    </div>
  );
}
