"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, MailCheck, ArrowLeft } from "lucide-react";

/**
 * /login/forgot — request a password reset link.
 * Goal-oriented, zero thinking: one field, one button, plain-English result.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="text-white/40 text-sm mt-1">
            Enter your email — we&apos;ll send a secure one-time link.
          </p>
        </div>

        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5 sm:p-6">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <MailCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-white font-medium">Check your inbox</p>
              <p className="text-sm text-white/50 leading-relaxed">
                If an account exists for <span className="text-white/80 font-medium">{email}</span>,
                a reset link is on its way. The link expires in 1 hour.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Didn&apos;t get it? Send another link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@company.com"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              {error && (
                <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending link…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>

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
