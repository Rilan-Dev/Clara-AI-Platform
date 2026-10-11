"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, MailCheck, CreditCard, ShieldAlert } from "lucide-react";

type Status = {
  orgId: string;
  emailVerified: boolean;
  featureAccess: boolean;
  onboarding: {
    plan_id: string;
    plan_name: string;
    status: string;
    payment_status: string;
    plan_enabled: boolean;
    plan_price_usd: number;
    activation_review_reason?: string | null;
  } | null;
};

export default function OnboardingGate({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscriptions/onboarding-status")
      .then((res) => res.ok ? res.json() : null)
      .then((value) => setData(value))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-[calc(100dvh-64px)] flex items-center justify-center text-sm text-muted-foreground">Checking account status…</div>;
  if (!data?.onboarding) return <>{children}</>;

  const { emailVerified, onboarding } = data;
  if (data.featureAccess && emailVerified && onboarding.status === "active") return <>{children}</>;

  // Keep navigation/read-only screens available. Every feature mutation is
  // independently blocked server-side by the auth subscription gate.
  const needsEmail = !emailVerified;
  const review = onboarding.status === "payment_review";
  const paymentRequired = emailVerified && !data.featureAccess && !review;
  const needsSubscription = paymentRequired && onboarding.plan_price_usd <= 0;

  const title = needsEmail
    ? "Verify your email before continuing"
    : review
      ? "Payment received — activation is under review"
      : needsSubscription
      ? "Choose a Clara AI subscription to unlock features"
      : "Email verified — payment required";

  if (!data.featureAccess) {
    const lockedMessage = !emailVerified
      ? "Your email address is not verified yet. Verify it to continue."
      : onboarding.status === "payment_review"
        ? "Your payment was received and is under review. Feature actions remain locked until activation is confirmed."
        : onboarding.payment_status === "paid"
          ? "Your payment is recorded, but the subscription has not been activated yet. Please wait for activation or contact support."
          : "Your email is verified. Complete payment for the selected plan to unlock Clara AI features.";
    return (
      <>
        {children}
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(92vw,760px)] -translate-x-1/2 rounded-2xl border border-amber-500/30 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />
            <p className="flex-1 text-sm text-foreground">{lockedMessage}</p>
            {!emailVerified ? (
              <Link href="/login/verify-email" className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Verify email</Link>
            ) : paymentRequired ? (
              <Link href={`/checkout?plan=${encodeURIComponent(onboarding.plan_id)}&orgId=${encodeURIComponent(data.orgId)}`} className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Continue payment</Link>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  const message = needsEmail
    ? "Your workspace is reserved, but paid features remain locked until your email address is verified."
    : review
      ? "We recorded your payment, but activation is still under review. You do not need to pay again."
      : onboarding.payment_status === "paid"
        ? "Your payment is recorded, but the subscription has not been activated yet. Please wait for activation or contact support."
        : needsSubscription
          ? "Choose a paid subscription to unlock agents, knowledge bases, AI actions, and other feature operations."
          : "Your email is verified. Complete payment for your selected plan to unlock Clara AI features.";

  return (
    <div className="min-h-[calc(100dvh-64px)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-7 sm:p-10 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
          {needsEmail ? <MailCheck className="w-6 h-6 text-primary" /> : review ? <ShieldAlert className="w-6 h-6 text-amber-600" /> : <CreditCard className="w-6 h-6 text-primary" />}
        </div>
        <h1 className="text-2xl font-black text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-3 leading-6">{message}</p>

        <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-semibold text-foreground">{onboarding.plan_name}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-muted-foreground">Status</span>
            <span className="font-semibold capitalize text-foreground">{onboarding.status.replaceAll("_", " ")}</span>
          </div>
        </div>

        {review ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Manual verification is required. Paid features remain unavailable until activation is confirmed.
          </div>
        ) : needsEmail ? (
          <Link href="/login/verify-email" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            Verify email <ArrowRight className="w-4 h-4" />
          </Link>
        ) : needsSubscription ? (
          <Link href={`/checkout?plan=starter&orgId=${encodeURIComponent(data.orgId)}`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            Choose a plan <ArrowRight className="w-4 h-4" />
          </Link>
        ) : onboarding.payment_status === "paid" ? (
          <button type="button" disabled
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-muted px-5 py-3 text-sm font-semibold text-muted-foreground cursor-not-allowed">
            Payment received — awaiting activation
          </button>
        ) : (
          <Link href={`/checkout?plan=${encodeURIComponent(onboarding.plan_id)}&orgId=${encodeURIComponent(data.orgId)}`}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            Continue payment <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        <p className="text-xs text-muted-foreground/80 text-center mt-4">
          You can view the workspace shell, but server-side feature actions remain locked until onboarding is complete.
        </p>
      </div>
    </div>
  );
}
