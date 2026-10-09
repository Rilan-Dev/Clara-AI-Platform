"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: "Too short",  color: "bg-rose-500"    },
    { label: "Weak",       color: "bg-rose-500"    },
    { label: "Okay",       color: "bg-amber-500"   },
    { label: "Good",       color: "bg-amber-500"   },
    { label: "Strong",     color: "bg-emerald-500" },
    { label: "Excellent",  color: "bg-emerald-500" },
  ];
  return { score, ...map[score] };
}

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [show, setShow]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);
  const [error, setError]           = useState("");

  const strength = passwordStrength(password);
  const valid = password.length >= 8 && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full min-w-0 max-w-full border border-border bg-card rounded-2xl p-4 sm:p-6 text-center shadow-sm [overflow-wrap:anywhere]">
        <p className="text-foreground font-medium">Reset link missing</p>
        <p className="text-sm text-muted-foreground mt-2 mb-4">
          This page needs a valid reset link from your email.
        </p>
        <Link
          href="/login/forgot"
          className="inline-block text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Request a new link →
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full min-w-0 max-w-full border border-border bg-card rounded-2xl p-4 sm:p-6 text-center space-y-4 shadow-sm [overflow-wrap:anywhere]">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
        </div>
        <p className="text-foreground font-medium">Password updated</p>
        <p className="text-sm text-muted-foreground">
          For your security, all active sessions were signed out.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 transition-all"
        >
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm [overflow-wrap:anywhere]">
      <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">New password</label>
          <div className="relative min-w-0">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              minLength={8}
              placeholder="At least 8 characters"
              className="block w-full min-w-0 max-w-full box-border bg-background border border-border rounded-xl px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary transition-colors"
            />
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i}
                    className={`h-1 flex-1 rounded-full ${i < strength.score ? strength.color : "bg-muted"}`} />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground w-16 text-right">{strength.label}</span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="page-confirm-password" className="block text-xs font-medium text-muted-foreground mb-1.5">Confirm password</label>
          <input id="page-confirm-password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="Repeat your new password"
            className={`block w-full min-w-0 max-w-full box-border bg-background border rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none transition-colors ${
              confirm && confirm !== password
                ? "border-destructive/50"
                : "border-border focus:border-primary"
            }`}
          />
          {confirm && confirm !== password && (
            <p className="text-[11px] text-destructive mt-1">Passwords don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !valid}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Updating…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}

/**
 * /login/reset?token=… — set a new password from an emailed reset link.
 */
export default function ResetPasswordPage() {
  return (
    <div className="min-h-[100dvh] w-full min-w-0 bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full min-w-0 max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="flex w-12 h-12 sm:w-14 sm:h-14 rounded-2xl mx-auto mb-4 shadow-lg shadow-primary/25" iconClassName="w-6 h-6 sm:w-7 sm:h-7" />
          <h1 className="text-2xl font-bold text-foreground">Choose a new password</h1>
          <p className="text-muted-foreground text-sm mt-1">Make it strong — you only need to remember one.</p>
        </div>

        <Suspense fallback={<div className="border border-border bg-card rounded-2xl p-6 text-muted-foreground text-sm shadow-sm">Loading…</div>}>
          <ResetForm />
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
