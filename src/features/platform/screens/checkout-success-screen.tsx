"use client";
/**
 * CheckoutSuccessScreen
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-payment confirmation page.
 *
 * URL params:
 *   ?orgId=UUID
 *   ?plan=starter|pro
 *   ?gateway=stripe|razorpay
 *   ?session_id=cs_…  (Stripe only — used to verify/display receipt)
 *   ?source=portal    (returning from Stripe portal)
 */

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Brain, CheckCircle2, ArrowRight, Zap, CreditCard, ExternalLink } from "lucide-react";

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["3 Knowledge Bases", "50 docs per KB", "1,000 req/day", "Voice AI", "API access"],
  pro:     ["10 Knowledge Bases", "200 docs per KB", "10,000 req/day", "Custom branding", "Priority support"],
};

const GATEWAY_LABELS: Record<string, string> = {
  stripe:   "Stripe",
  razorpay: "Razorpay",
};

export default function CheckoutSuccessScreen() {
  const searchParams = useSearchParams();
  const orgId     = searchParams.get("orgId")    ?? "";
  const planId    = searchParams.get("plan")     ?? "starter";
  const gateway   = searchParams.get("gateway")  ?? "stripe";
  const source    = searchParams.get("source")   ?? "";
  const sessionId = searchParams.get("session_id") ?? "";

  const features  = PLAN_FEATURES[planId] ?? [];
  const planName  = planId.charAt(0).toUpperCase() + planId.slice(1);
  const isPortal  = source === "portal";

  return (
    <div className="min-h-screen px-4 py-10 sm:py-20 flex items-center justify-center">
      <div className="w-full max-w-lg text-center">

        {/* Logo */}
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-lg">Clara AI</span>
        </Link>

        {/* Success icon */}
        <div className="relative inline-flex mb-6">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 sm:w-10 sm:h-10 text-emerald-400" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 border-2 border-[#0a0a0f] flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
        </div>

        {isPortal ? (
          <>
            <h1 className="text-3xl font-black text-white mb-2">Billing settings saved</h1>
            <p className="text-white/50 mb-8">Your subscription changes are now in effect.</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-black text-white mb-2">
              You&apos;re on <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">{planName}!</span>
            </h1>
            <p className="text-white/50 mb-2">Payment processed successfully via {GATEWAY_LABELS[gateway] ?? gateway}.</p>
            <p className="text-white/30 text-sm mb-8">Your plan is active now.</p>
          </>
        )}

        {/* Plan features */}
        {!isPortal && features.length > 0 && (
          <div className="border border-emerald-500/20 bg-emerald-500/[0.04] rounded-2xl p-5 mb-6 text-left">
            <p className="text-xs font-semibold text-emerald-400 mb-3 uppercase tracking-wide">
              What&apos;s included in your {planName} plan
            </p>
            <div className="space-y-2">
              {features.map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-white/70">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment meta */}
        {!isPortal && (
          <div className="border border-white/[0.08] bg-white/[0.03] rounded-xl p-4 mb-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">Gateway</span>
              <span className="text-white flex items-center gap-1">
                {gateway === "stripe"
                  ? <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                  : <Zap className="w-3.5 h-3.5 text-cyan-400" />}
                {GATEWAY_LABELS[gateway] ?? gateway}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Plan</span>
              <span className="text-white">{planName}</span>
            </div>
            {sessionId && (
              <div className="flex justify-between">
                <span className="text-white/40">Session</span>
                <span className="text-white/50 font-mono text-xs truncate max-w-[180px]">{sessionId.slice(0, 28)}…</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-white/40">Status</span>
              <span className="text-emerald-400 font-medium">Active</span>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all">
            Go to dashboard <ArrowRight className="w-4 h-4" />
          </Link>

          {/* Stripe billing portal link */}
          {gateway === "stripe" && orgId && (
            <button
              onClick={async () => {
                const r = await fetch(`/api/subscriptions/portal?orgId=${orgId}`);
                const d = await r.json() as { url?: string };
                if (d.url) window.open(d.url, "_blank");
              }}
              className="inline-flex items-center justify-center gap-2 border border-white/10 text-white/50 hover:text-white hover:border-white/20 font-medium px-6 py-2.5 rounded-xl text-sm transition-all">
              <ExternalLink className="w-3.5 h-3.5" /> Manage billing
            </button>
          )}
        </div>

        <p className="text-xs text-white/20 mt-6">
          Invoice will be sent to your registered email address.
        </p>
      </div>
    </div>
  );
}
