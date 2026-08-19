"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, Eye, EyeOff } from "lucide-react";
import axios, { isAxiosError } from "axios";
import { setStoredToken } from "@/lib/client-auth";
import { getApiBaseUrl } from "@/lib/runtime";

// Auth calls go directly to the backend's own /api/auth/login route.
// On success the backend sets the `clara_platform_token` httpOnly cookie.
const authClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15_000,
});

function getSafeRedirect(value: string | null): string {
  // Only allow same-origin relative paths. Never redirect to an external URL.
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export default function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirect(searchParams.get("redirect"));
  const [email, setEmail]       = useState("admin@clara.ai");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // POST /api/auth/login (backend's own route — sets `clara_platform_token`)
      const { data } = await authClient.post<{ token?: string }>("/api/auth/login", { email, password });
      if (data.token) {
        setStoredToken(data.token);
      }

      // Preserve the protected route that originally sent the user to login.
      // router.replace avoids leaving the login page in browser history and
      // router.refresh makes the newly-established auth cookie visible to the
      // protected route/middleware on the next navigation.
      router.replace(redirectTo);
      router.refresh();
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
          <p className="text-white/40 text-sm mt-1">Sign in to manage Clara AI</p>
        </div>

        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
              <div className="relative">
                <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="text-center text-xs text-white/20 mt-4">Default: admin@clara.ai / Admin1234!</p>
        </div>
      </div>
    </div>
  );
}
