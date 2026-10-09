"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";

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
    <div className="min-h-[100dvh] w-full min-w-0 bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full min-w-0 max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="flex w-12 h-12 sm:w-14 sm:h-14 rounded-2xl mx-auto mb-4 shadow-lg shadow-primary/25" iconClassName="w-6 h-6 sm:w-7 sm:h-7" />
          <h1 className="text-2xl font-bold text-foreground break-words [overflow-wrap:anywhere]">Reset your password</h1>
          <p className="text-muted-foreground text-sm mt-1 break-words [overflow-wrap:anywhere]">
            Enter your email — we&apos;ll send a secure one-time link.
          </p>
        </div>

        <div className="w-full min-w-0 max-w-full border border-border bg-card rounded-2xl p-4 sm:p-6 shadow-sm [overflow-wrap:anywhere]">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <MailCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-foreground font-medium">Check your inbox</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If an account exists for <span className="text-foreground/80 font-medium">{email}</span>,
                a reset link is on its way. The link expires in 1 hour.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Didn&apos;t get it? Send another link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
              <div>
                <label htmlFor="page-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                <input id="page-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@company.com"
                  className="block w-full min-w-0 max-w-full box-border bg-background border border-border rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {error && (
                <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending link…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>

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
