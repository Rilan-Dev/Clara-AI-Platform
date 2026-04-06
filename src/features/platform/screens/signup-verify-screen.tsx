"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Brain, Mail, CheckCircle2, ArrowRight, RefreshCw } from "lucide-react";

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

  async function handleResend() {
    setResending(true);
    // Placeholder: real implementation would call POST /api/auth/resend-verification
    await new Promise(r => setTimeout(r, 1200));
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  }

  return (
    <div className="min-h-screen px-4 py-20 flex items-center justify-center">
      <div className="w-full max-w-md text-center">

        {/* Logo */}
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-lg">Clara AI</span>
        </Link>

        {/* Icon */}
        <div className="relative inline-flex mb-6">
          <div className="w-20 h-20 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Mail className="w-10 h-10 text-indigo-400" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#0a0a0f] flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-white mb-3">Check your inbox</h1>
        <p className="text-white/50 text-base leading-relaxed mb-2">
          We&apos;ve sent a verification link to
        </p>
        <p className="text-indigo-300 font-semibold text-lg mb-6 break-all">{email}</p>

        {/* Info card */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5 mb-6 text-left space-y-3">
          {[
            { n: "1", text: "Open the email from Clara AI" },
            { n: "2", text: "Click the verification link" },
            { n: "3", text: "You'll be signed into your new workspace automatically" },
          ].map(step => (
            <div key={step.n} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                {step.n}
              </div>
              <span className="text-sm text-white/60">{step.text}</span>
            </div>
          ))}
        </div>

        {/* Plan reminder */}
        <div className="border border-emerald-500/20 bg-emerald-500/[0.04] rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-white/60 text-left">
            Your <span className="text-white font-medium">{planName} plan</span> 14-day trial starts once you verify.
          </p>
        </div>

        {/* Resend */}
        <div className="mb-6">
          {resent ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Email resent successfully!
            </div>
          ) : (
            <p className="text-white/30 text-sm">
              Didn&apos;t receive it?{" "}
              <button onClick={handleResend} disabled={resending}
                className="text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center gap-1 disabled:opacity-50">
                {resending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Resending…</> : "Resend email"}
              </button>
              <span className="block text-xs text-white/20 mt-1">Check your spam folder if it doesn&apos;t arrive within a minute.</span>
            </p>
          )}
        </div>

        {/* CTA — already verified / use later */}
        <div className="flex flex-col gap-2">
          <Link href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all">
            Continue to dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/"
            className="text-xs text-white/25 hover:text-white/50 transition-colors py-1">
            ← Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
