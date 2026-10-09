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
 *
 * Paid checkout can return here before onboarding is fully active. The
 * activation status is checked server-side so this screen does not claim
 * a paid plan is active while email verification or activation is pending.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Zap, CreditCard, ExternalLink, MailWarning, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["3 Knowledge Bases", "50 docs per KB", "1,000 req/day", "Voice AI", "API access"],
  pro:     ["10 Knowledge Bases", "200 docs per KB", "10,000 req/day", "Custom branding", "Priority support"],
};

const GATEWAY_LABELS: Record<string, string> = {
  stripe:   "Stripe",
  razorpay: "Razorpay",
};

// Charged amount per plan and gateway — mirrors PLAN_AMOUNTS_CENTS (Stripe)
// and PLAN_AMOUNTS_INR_PAISE (Razorpay) on the server.
const PLAN_AMOUNTS: Record<string, { usd: string; inr: string }> = {
  starter: { usd: "$49.00", inr: "₹4,000.00" },
  pro:     { usd: "$149.00", inr: "₹12,000.00" },
};

export default function CheckoutSuccessScreen() {
  const searchParams = useSearchParams();
  const orgId     = searchParams.get("orgId")    ?? "";
  const planId    = searchParams.get("plan")     ?? "starter";
  const gateway   = searchParams.get("gateway")  ?? "stripe";
  const source    = searchParams.get("source")   ?? "";
  const sessionId = searchParams.get("session_id") ?? "";
  const payRef    = searchParams.get("ref")       ?? "";   // Razorpay payment id

  // Verify-email resend (paid signup funnel — the session identifies the
  // user, so no email address is needed here). Non-blocking by design.
  const [activationStatus, setActivationStatus] = useState<string>("checking");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState("");
  const isPortal  = source === "portal";

  // Receipt dates — set after mount so server and client markup match.
  const [todayStr, setTodayStr]     = useState("");
  const [renewalStr, setRenewalStr] = useState("");
  useEffect(() => {
    const now = new Date();
    const renewal = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    setTodayStr(fmt(now));
    setRenewalStr(fmt(renewal));
  }, []);

  useEffect(() => {
    if (isPortal || !orgId) return;
    let cancelled = false;
    let attempts = 0;

    // Confirm the payment with Stripe directly instead of waiting for the
    // webhook: activation then works even if the webhook is misrouted,
    // delayed or failing. Safe to call more than once.
    const verifyStripeSession = async (): Promise<void> => {
      if (gateway !== "stripe" || !sessionId.startsWith("cs_")) return;
      try {
        await fetch("/api/subscriptions/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, orgId }),
          cache: "no-store",
        });
      } catch {
        // Fall through to status polling — the webhook may still arrive.
      }
    };

    const checkStatus = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/subscriptions/onboarding-status?orgId=${encodeURIComponent(orgId)}`, {
          cache: "no-store",
        });
        const data = res.ok
          ? await res.json() as { emailVerified?: boolean; onboarding?: { status?: string; payment_status?: string } }
          : null;
        if (cancelled) return;

        if (!data?.emailVerified) {
          setActivationStatus("pending_email");
          return;
        }

        const status = data.onboarding?.status ?? "payment_review";
        setActivationStatus(status);

        // Stripe can deliver the webhook just after the browser returns from
        // Checkout. Poll briefly so the success screen moves to the active
        // state without making the user manually revisit the page.
        if (status === "payment_pending" && attempts < 20) {
          attempts += 1;
          // Re-confirm with Stripe every few tries (async payment methods can
          // settle a little after the redirect), backing off to 3 s.
          if (attempts % 5 === 0) await verifyStripeSession();
          window.setTimeout(checkStatus, attempts < 10 ? 1000 : 3000);
        }
      } catch {
        if (!cancelled) setActivationStatus("payment_review");
      }
    };

    void verifyStripeSession().then(checkStatus);
    return () => { cancelled = true; };
  }, [isPortal, orgId, gateway, sessionId]);

  async function handleResendVerification() {
    setResending(true);
    setResendError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // empty body → authenticated fallback
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not resend the email.");
      setResent(true);
      setTimeout(() => setResent(false), 6000);
    } catch (err) {
      setResendError((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  const features  = PLAN_FEATURES[planId] ?? [];
  const planName  = planId.charAt(0).toUpperCase() + planId.slice(1);

  return (
    <div className="min-h-[100dvh] w-full min-w-0 px-4 py-8 sm:py-12 md:py-20 flex items-center justify-center">
      <div className="w-full min-w-0 max-w-lg text-center [overflow-wrap:anywhere]">

        {/* Logo */}
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <LogoMark className="w-9 h-9 rounded-xl" iconClassName="w-5 h-5" />
          <span className="font-bold text-foreground text-lg">Clara AI</span>
        </Link>

        {/* Success icon */}
        <div className="relative inline-flex mb-6 clara-check-in">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 sm:w-10 sm:h-10 text-emerald-600" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 border-2 border-background flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
        </div>

        {isPortal ? (
          <>
            <h1 className="text-3xl font-black text-foreground mb-2 break-words [overflow-wrap:anywhere]">Billing settings saved</h1>
            <p className="text-muted-foreground mb-8">Your subscription changes are now in effect.</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-black text-foreground mb-2 break-words [overflow-wrap:anywhere]">
              {activationStatus === "pending_email"
                ? <>Payment received — <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">verify your email</span></>
                : activationStatus === "checking"
                  ? <>Payment received for <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">{planName}</span></>
                  : activationStatus === "active"
                    ? <>You&apos;re on <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">{planName}!</span></>
                    : <>Payment received — <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">activation pending</span></>}
            </h1>
            <p className="text-muted-foreground mb-2">Payment processed successfully via {GATEWAY_LABELS[gateway] ?? gateway}.</p>
            <p className="text-muted-foreground/70 text-sm mb-8">
              {activationStatus === "pending_email"
                ? "Verify your email before your paid plan can be activated."
                : activationStatus === "active"
                  ? "Your plan is active now."
                  : "Your payment has been received. We’ll finish activation once all required checks are complete."}
            </p>
          </>
        )}

        {/* Plan features */}
        {!isPortal && features.length > 0 && (
          <div className="w-full min-w-0 border border-emerald-500/20 bg-emerald-500/[0.04] rounded-2xl p-4 sm:p-5 mb-6 text-left [overflow-wrap:anywhere]">
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

        {/* Receipt */}
        {!isPortal && (
          <div className="w-full min-w-0 border border-border bg-card rounded-xl p-4 mb-6 text-left [overflow-wrap:anywhere]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-2 border-b border-border">
              Receipt
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Plan</span>
                <span className="text-foreground font-medium">{planName} · monthly</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-bold">
                  {PLAN_AMOUNTS[planId]
                    ? (gateway === "razorpay" ? PLAN_AMOUNTS[planId]!.inr : PLAN_AMOUNTS[planId]!.usd)
                    : "—"}
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Gateway</span>
                <span className="text-foreground flex items-center gap-1">
                  {gateway === "stripe"
                    ? <CreditCard className="w-3.5 h-3.5 text-primary" />
                    : <Zap className="w-3.5 h-3.5 text-cyan-600" />}
                  {GATEWAY_LABELS[gateway] ?? gateway}
                </span>
              </div>
              {todayStr && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Date</span>
                  <span className="text-foreground">{todayStr}</span>
                </div>
              )}
              {(sessionId || payRef) && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Transaction ref</span>
                  <span className="max-w-full break-words [overflow-wrap:anywhere] text-muted-foreground font-mono text-xs">
                    {(payRef || sessionId).slice(0, 24)}…
                  </span>
                </div>
              )}
              {renewalStr && PLAN_AMOUNTS[planId] && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Renews</span>
                  <span className="text-foreground">{renewalStr}</span>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 pt-2 mt-1 border-t border-border">
                <span className="text-muted-foreground">Status</span>
                <span className={activationStatus === "active" ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{activationStatus === "checking" ? "Checking…" : activationStatus.replaceAll("_", " ")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Verify-email reminder (paid signup funnel only — portal visits
            and returning customers are already verified) */}
        {!isPortal && activationStatus === "pending_email" && (
          <div className="border border-amber-500/25 bg-amber-500/[0.06] rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-3">
              <MailWarning className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">One last step — verify your email</p>
                <p className="text-xs text-muted-foreground mt-1">
                  We sent a confirmation link when you signed up. Verify to secure your account
                  and make sure billing receipts reach your inbox.
                </p>
                {resent ? (
                  <p className="text-xs text-emerald-600 mt-2">
                    Verification email resent — check your inbox (and spam folder).
                  </p>
                ) : resendError ? (
                  <p className="text-xs text-destructive mt-2">{resendError}</p>
                ) : (
                  <button
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                    {resending ? "Resending…" : "Resend verification email"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          {activationStatus === "active" ? (
            <Link href={orgId ? `/orgs/${encodeURIComponent(orgId)}` : "/orgs"}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-xl text-sm transition-all">
              Continue to Clara AI <ArrowRight className="w-4 h-4" />
            </Link>
          ) : activationStatus === "pending_email" ? (
            <Link href="/login"
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-xl text-sm transition-all">
              Return to Clara AI <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link href={orgId ? `/orgs/${encodeURIComponent(orgId)}` : "/orgs"}
              className="inline-flex items-center justify-center gap-2 border border-border text-foreground/80 hover:text-foreground hover:border-primary/40 font-medium px-6 py-3 rounded-xl text-sm transition-all">
              {activationStatus === "payment_pending" ? "Open your Clara dashboard" : "Continue to Clara dashboard"} <ArrowRight className="w-4 h-4" />
            </Link>
          )}

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

        <p className="text-xs text-muted-foreground/80 mt-6">
          Invoice will be sent to your registered email address.
        </p>
      </div>
    </div>
  );
}
