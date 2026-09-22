"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Brain, ShieldCheck, AlertCircle, ArrowLeft } from "lucide-react";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<"verifying" | "done" | "error">("verifying");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json() as {
          ok?: boolean; error?: string; email?: string; alreadyVerified?: boolean;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Verification failed");
        setState("done");
        setEmail(data.email ?? "");
        setMessage(
          data.alreadyVerified
            ? "This email was already confirmed."
            : "Your email has been confirmed successfully."
        );
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setMessage((err as Error).message);
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  if (!token) {
    return (
      <div className="border border-border bg-card rounded-2xl p-6 text-center shadow-sm">
        <p className="text-foreground font-medium">Verification link missing</p>
        <p className="text-sm text-muted-foreground mt-2 mb-4">
          This page needs a valid verification link from your email.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Go to sign in →
        </Link>
      </div>
    );
  }

  if (state === "verifying") {
    return (
      <div className="border border-border bg-card rounded-2xl p-6 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <span className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
        <p className="text-foreground font-medium">Confirming your email…</p>
        <p className="text-sm text-muted-foreground mt-1">Hang on a moment.</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="border border-border bg-card rounded-2xl p-6 text-center space-y-4 shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-foreground font-medium">Verification link problem</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 transition-all"
        >
          Sign in to resend the link
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card rounded-2xl p-6 text-center space-y-4 shadow-sm">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <ShieldCheck className="w-6 h-6 text-emerald-600" />
      </div>
      <p className="text-foreground font-medium">Email verified 🎉</p>
      <p className="text-sm text-muted-foreground">
        Your email has been verified. Go back to the Clara AI registration window to continue.
        You do not need to navigate anywhere from this email verification page.
      </p>
      {email && (
        <p className="text-xs text-muted-foreground/70 break-all">{email}</p>
      )}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left">
        <p className="text-xs font-semibold text-foreground">Continue your registration</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Return to the registration tab or window you were using. Once verification is detected,
          Clara will continue the signup flow and take you to checkout for your selected paid plan.
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
            <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Email verification</h1>
          <p className="text-muted-foreground text-sm mt-1">Confirming your Clara AI account.</p>
        </div>

        <Suspense fallback={<div className="border border-border bg-card rounded-2xl p-6 text-muted-foreground text-sm shadow-sm">Loading…</div>}>
          <VerifyEmailForm />
        </Suspense>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
