"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Brain, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import axios, { isAxiosError } from "axios";
import { setStoredToken } from "@/lib/client-auth";
import { AUTH_LOGIN_ENDPOINT, getSafeRedirect } from "./login-redirect";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Keep login on the current origin so the Set-Cookie response from
      // /api/auth/login is stored for the same host that serves /dashboard.
      const { data } = await authClient.post<{ token?: string }>(
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

      // Do a full navigation rather than an in-place router transition. This
      // guarantees the next request is made with the freshly-issued cookie and
      // avoids the login page remaining mounted after authentication.
      window.location.replace(redirectTo);
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const msg = (err.response?.data as { error?: string })?.error;
        setError(msg || (err.response ? "Invalid credentials" : "Connection failed. Is the server running?"));
      } else {
        setError("An unexpected error occurred.");
      }
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
          <h1 className="text-2xl font-bold text-white">Welcome to Clara AI</h1>
          <p className="text-white/40 text-sm mt-1">Sign in to manage Clara AI</p>
        </div>
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
              <div className="relative">
                <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-base sm:py-2.5 sm:text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <Link href="/login/forgot" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>
            {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium py-2.5 rounded-xl hover:from-indigo-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
