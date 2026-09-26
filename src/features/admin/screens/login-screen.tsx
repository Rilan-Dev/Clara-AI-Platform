"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, MailWarning, RefreshCw } from "lucide-react";
import Link from "next/link";
import axios, { isAxiosError } from "axios";
import { clearStoredToken, setStoredToken, withAuthHeaders } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AUTH_LOGIN_ENDPOINT, getSafeRedirect } from "./login-redirect";
import { LogoMark } from "@/components/brand/Logo";

// Authentication is intentionally same-origin. The login API sets the
// HttpOnly session cookie used by Next middleware to protect /dashboard and
// other platform pages. Calling a separate API origin would scope that cookie
// to the API host and leaves the UI host unauthenticated after a successful
// login.
const authClient = axios.create({
  timeout: 15_000,
});

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirect(searchParams.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Post-login interstitial: signed in, but the email is not verified yet.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState("");

  async function handleResendVerification() {
    setResending(true);
    setResendError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Keep login on the current origin so the Set-Cookie response from
      // /api/auth/login is stored for the same host that serves /dashboard.
      const { data } = await authClient.post<{ token?: string; emailVerified?: boolean }>(
        AUTH_LOGIN_ENDPOINT,
        { email, password },
        { withCredentials: true },
      );

      if (!data.token) {
        setError("Login succeeded but no session token was returned. Please try again.");
        return;
      }

      // Keep the bearer token for client-side API calls as before. The
      // HttpOnly cookie is the authoritative browser session for middleware.
      setStoredToken(data.token);

      // Unverified account → keep the user on the verification interstitial.
      // The session exists, but workspace access remains gated until email
      // verification and onboarding requirements are satisfied.
      if (data.emailVerified === false) {
        setNeedsVerification(true);
        return;
      }

      // Do a full navigation rather than an in-place router transition. This
      // guarantees the next request is made with the freshly-issued cookie and
      // avoids the login page remaining mounted after authentication.
      window.location.replace(redirectTo);
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const msg = (err.response?.data as { error?: string })?.error;
        setError(msg || (err.response ? "Incorrect email or password." : "We couldn't reach Clara. Check your connection and try again."));
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4">
      {/* Personal theme switch — the platform default still governs the
          first visit; anyone can flip their own copy here. */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="flex w-12 h-12 sm:w-14 sm:h-14 rounded-2xl mx-auto mb-4 shadow-lg shadow-primary/25" iconClassName="w-6 h-6 sm:w-7 sm:h-7" />
          <h1 className="text-2xl font-bold text-foreground">Welcome to Clara AI</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to manage Clara AI</p>
        </div>
        <div className="border border-border bg-card rounded-2xl p-5 sm:p-6 shadow-sm">
          {needsVerification ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <MailWarning className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-foreground font-medium">Email verification required</p>
                <p className="text-sm text-muted-foreground mt-1 break-all">
                  We sent a confirmation link to <span className="text-foreground/80 font-medium">{email}</span>.
                  Verify your email before continuing to your Clara AI workspace.
                </p>
              </div>
              {resent ? (
                <div role="status" className="text-sm text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  Verification email resent — check your inbox.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="w-full border border-border text-foreground/80 hover:text-foreground hover:border-primary/40 font-medium py-2.5 rounded-xl text-sm transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {resending ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Resending…</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> Resend verification email</>
                  )}
                </button>
              )}
              {resendError && (
                <p role="alert" className="text-xs text-destructive">{resendError}</p>
              )}
              <button
                type="button"
                onClick={async () => {
                  // A session was already issued — end it so "back to sign in"
                  // really means signed out.
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: withAuthHeaders() }).catch(() => undefined);
                  clearStoredToken();
                  window.location.replace("/login");
                }}
                className="w-full border border-border text-foreground/80 hover:text-foreground hover:border-primary/40 font-medium py-2.5 rounded-xl transition-all"
              >
                Return to sign in
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required
                aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
              <div className="relative">
                <input id="login-password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required
                  aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus:border-primary transition-colors" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <Link href="/login/forgot" className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>
            {error && <div id="login-error" role="alert" className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          )}
        </div>
        {!needsVerification && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to Clara AI?{" "}
            <Link href="/signup" className="font-medium text-primary hover:text-primary/80">Create an account</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div role="status" className="text-muted-foreground">Loading…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
