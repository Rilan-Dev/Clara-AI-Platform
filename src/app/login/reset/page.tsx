"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Brain, ShieldCheck, ArrowLeft, Eye, EyeOff } from "lucide-react";

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
    { label: "Good",       color: "bg-yellow-400"  },
    { label: "Strong",     color: "bg-emerald-500" },
    { label: "Excellent",  color: "bg-emerald-400" },
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
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 text-center">
        <p className="text-white font-medium">Reset link missing</p>
        <p className="text-sm text-white/50 mt-2 mb-4">
          This page needs a valid reset link from your email.
        </p>
        <Link
          href="/login/forgot"
          className="inline-block text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Request a new link →
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-white font-medium">Password updated</p>
        <p className="text-sm text-white/50">
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
    <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">New password</label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i}
                    className={`h-1 flex-1 rounded-full ${i < strength.score ? strength.color : "bg-white/10"}`} />
                ))}
              </div>
              <span className="text-[11px] text-white/40 w-16 text-right">{strength.label}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">Confirm password</label>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="Repeat your new password"
            className={`w-full bg-white/[0.05] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none transition-colors ${
              confirm && confirm !== password
                ? "border-rose-500/50"
                : "border-white/10 focus:border-indigo-500"
            }`}
          />
          {confirm && confirm !== password && (
            <p className="text-[11px] text-rose-400 mt-1">Passwords don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !valid}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
          <p className="text-white/40 text-sm mt-1">Make it strong — you only need to remember one.</p>
        </div>

        <Suspense fallback={<div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6 text-white/40 text-sm">Loading…</div>}>
          <ResetForm />
        </Suspense>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
