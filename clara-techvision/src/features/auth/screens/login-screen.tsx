"use client";

import { Suspense, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { Cpu, Eye, EyeOff, AlertCircle } from "lucide-react";
import { z } from "zod";
import { authService } from "@/services/api/auth.service";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "techvision-admin@techvision.io",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setLoading(true);
    setError("");

    try {
      await authService.login(values);
      router.push(searchParams.get("next") || "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex">
      <div className="hidden lg:flex flex-col justify-between w-[44%] bg-gradient-to-br from-[#0f172a] to-[#0c1d3a] p-12 border-r border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-lg">TechVision</div>
            <div className="text-xs text-sky-400">Solutions Platform</div>
          </div>
        </div>
        <div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            AI knowledge,<br />instantly accessible
          </h2>
          <p className="text-white/50 text-sm mb-8">Search your entire product documentation and engineering runbooks in seconds with Clara AI.</p>
          <div className="space-y-3">
            {[
              "Semantic search across all docs",
              "Floating AI assistant on every page",
              "Voice-enabled queries",
              "Starter plan - 3 KBs, 1K req/day",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-white/60">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-white/20">© 2025 TechVision Solutions · Powered by Clara AI</div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-white">TechVision Solutions</div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
          <p className="text-white/40 text-sm mb-8">Sign in to TechVision AI Portal</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoFocus
                {...register("email")}
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500/50 transition-colors"
              />
              {errors.email ? <p className="mt-1 text-xs text-red-400">{errors.email.message}</p> : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  {...register("password")}
                  placeholder="••••••••"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white focus:outline-none focus:border-sky-500/50 transition-colors placeholder-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password ? <p className="mt-1 text-xs text-red-400">{errors.password.message}</p> : null}
            </div>

            {error ? (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-opacity shadow-lg shadow-sky-500/20"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-center text-xs text-white/20 mt-6">Demo: techvision-admin@techvision.io / Admin1234!</p>
        </div>
      </div>
    </div>
  );
}

export default function TechVisionLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
