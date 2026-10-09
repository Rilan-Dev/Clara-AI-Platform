"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, CheckCircle2, ArrowRight, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { LogoMark } from "@/components/brand/Logo";

const PLAN_NAMES: Record<string, string> = {
  free: "Free", starter: "Starter", pro: "Pro",
};

export default function SignupVerifyScreen() {
  const searchParams = useSearchParams();
  const email  = searchParams.get("email") ?? "";
  const planId = searchParams.get("plan")  ?? "free";
  const planName = PLAN_NAMES[planId] ?? planId;

  const [resent,   setResent]   = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");

  async function handleResend() {
    setResending(true);
    setResendError("");
    try {
      // Real implementation — POST /api/auth/resend-verification. Always
      // 200 (never leaks account existence); rate limited 3 / 10 min.
      const res = await fetch(apiUrl("/api/auth/resend-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not resend the email.");
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err) {
      setResendError((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] w-full min-w-0 px-4 py-8 sm:py-12 md:py-20 flex items-center justify-center">
      <div className="w-full min-w-0 max-w-md text-center [overflow-wrap:anywhere]">

        {/* Logo */}
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <LogoMark className="w-9 h-9 rounded-xl" iconClassName="w-5 h-5" />
          <span className="font-bold text-foreground text-lg">Clara AI</span>
        </Link>

        {/* Icon */}
        <div className="relative inline-flex mb-6">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Mail className="w-7 h-7 sm:w-10 sm:h-10 text-primary" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-foreground mb-3 break-words [overflow-wrap:anywhere]">Check your inbox</h1>
        <p className="text-muted-foreground text-base leading-relaxed mb-2">
          We&apos;ve sent a verification link to
        </p>
        <p className="text-primary font-semibold text-lg mb-6 break-words [overflow-wrap:anywhere]">{email}</p>

        {/* Info card */}
        <div className="w-full min-w-0 border border-border bg-card rounded-2xl p-4 sm:p-5 mb-6 text-left space-y-3 [overflow-wrap:anywhere]">
          {[
            { n: "1", text: "Open the email from Clara AI" },
            { n: "2", text: "Click the verification link" },
            { n: "3", text: planId === "free" ? "Return to your signup window to finish setup" : "Return to your signup window to continue to payment" },
          ].map(step => (
            <div key={step.n} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {step.n}
              </div>
              <span className="min-w-0 text-sm text-muted-foreground break-words [overflow-wrap:anywhere]">{step.text}</span>
            </div>
          ))}
        </div>

        {/* Plan reminder */}
        <div className="w-full min-w-0 border border-emerald-500/20 bg-emerald-500/[0.04] rounded-xl px-4 py-3 mb-6 flex items-start gap-3 [overflow-wrap:anywhere]">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-muted-foreground text-left">
            {planId === "free" ? (
              <>Your <span className="text-foreground font-medium">{planName} plan</span> is free. Verify your email, then return to your signup window to finish setup.</>
            ) : (
              <>Your <span className="text-foreground font-medium">{planName} plan</span> continues to payment after you verify. It will not activate until payment is confirmed.</>
            )}
          </p>
        </div>

        {/* Resend */}
        <div className="mb-6">
          {resent ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="w-4 h-4" /> Verification email resent!
            </div>
          ) : (
            <p className="text-muted-foreground/70 text-sm">
              Didn&apos;t receive it?{" "}
              <button onClick={handleResend} disabled={resending || !email}
                className="text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 disabled:opacity-50">
                {resending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Resending…</> : "Resend email"}
              </button>
              <span className="block text-xs text-muted-foreground/80 mt-1">Check your spam folder if it doesn&apos;t arrive within a minute.</span>
            </p>
          )}
          {resendError && (
            <p className="text-xs text-destructive mt-2">{resendError}</p>
          )}
        </div>

        {/* CTA — already verified / use later */}
        <div className="flex flex-col gap-2">
          <Link href="/login"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-xl text-sm transition-all">
            Return to Clara AI <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/"
            className="text-xs text-muted-foreground/70 hover:text-foreground/80 transition-colors py-1">
            ← Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
