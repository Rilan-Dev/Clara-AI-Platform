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
          <span className="font-bold text-foreground text-lg">Clara AI</span>
        </Link>

        {/* Success icon */}
        <div className="relative inline-flex mb-6">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 sm:w-10 sm:h-10 text-emerald-600" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 border-2 border-background flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
        </div>

        {isPortal ? (
          <>
            <h1 className="text-3xl font-black text-foreground mb-2">Billing settings saved</h1>
            <p className="text-muted-foreground mb-8">Your subscription changes are now in effect.</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-black text-foreground mb-2">
              You&apos;re on <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">{planName}!</span>
            </h1>
            <p className="text-muted-foreground mb-2">Payment processed successfully via {GATEWAY_LABELS[gateway] ?? gateway}.</p>
            <p className="text-muted-foreground/70 text-sm mb-8">Your plan is active now.</p>
          </>
        )}

        {/* Plan features */}
        {!isPortal && features.length > 0 && (
          <div className="border border-emerald-500/20 bg-emerald-500/[0.04] rounded-2xl p-5 mb-6 text-left">
            <p className="text-xs font-semibold text-emerald-600 mb-3 uppercase tracking-wide">
              What&apos;s included in your {planName} plan
            </p>
            <div className="space-y-2">
              {features.map(f => (
                <div key={f} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-foreground/80">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment meta */}
        {!isPortal && (
          <div className="border border-border bg-card rounded-xl p-4 mb-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gateway</span>
              <span className="text-foreground flex items-center gap-1">
                {gateway === "stripe"
                  ? <CreditCard className="w-3.5 h-3.5 text-primary" />
                  : <Zap className="w-3.5 h-3.5 text-cyan-600" />}
                {GATEWAY_LABELS[gateway] ?? gateway}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="text-foreground">{planName}</span>
            </div>
            {sessionId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Session</span>
                <span className="text-muted-foreground font-mono text-xs truncate max-w-[180px]">{sessionId.slice(0, 28)}…</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="text-emerald-600 font-medium">Active</span>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-xl text-sm transition-all">
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
              className="inline-flex items-center justify-center gap-2 border border-border text-foreground/70 hover:text-foreground hover:border-primary/40 font-medium px-6 py-2.5 rounded-xl text-sm transition-all">
              <ExternalLink className="w-3.5 h-3.5" /> Manage billing
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground/50 mt-6">
          Invoice will be sent to your registered email address.
        </p>
      </div>
    </div>
  );
}
