"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Brain, Check, Eye, EyeOff, ArrowRight, ArrowLeft,
  Building2, User, Zap, AlertCircle,
} from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { setStoredToken } from "@/lib/client-auth";

type PlanMeta = { id: string; name: string; price: string; description: string; badge?: string; color: string; ring: string; features: string[] };
const PLAN_META: PlanMeta[] = [
  { id: "free",    name: "Free",    price: "$0/mo",   description: "Great for experimenting", color: "border-white/[0.12] bg-white/[0.03]",          ring: "ring-2 ring-white/30",         features: ["1 Knowledge Base","10 docs","100 req/day","Text chat only"] },
  { id: "starter", name: "Starter", price: "$49/mo",  description: "For small teams",         color: "border-cyan-500/30 bg-cyan-500/[0.04]",         ring: "ring-2 ring-cyan-500/60",      features: ["3 Knowledge Bases","50 docs per KB","1,000 req/day","Voice AI"] },
  { id: "pro",     name: "Pro",     price: "$149/mo", description: "For growing businesses",  badge: "Most popular", color: "border-indigo-500/40 bg-indigo-600/[0.07]", ring: "ring-2 ring-indigo-500", features: ["10 Knowledge Bases","200 docs per KB","10,000 req/day","Advanced analytics"] },
];

type Step = "plan" | "account" | "org" | "review";
type FormData = { planId: string; fullName: string; email: string; password: string; confirmPassword: string; orgName: string };
const STEP_ORDER: Step[] = ["plan", "account", "org", "review"];
const STEP_LABELS = ["Choose plan", "Your account", "Your org", "Review"];

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: "Weak",   color: "bg-rose-500" };
  if (s <= 3) return { score: s, label: "Fair",   color: "bg-amber-500" };
  return           { score: s, label: "Strong", color: "bg-emerald-500" };
}

export default function SignupScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialPlan  = (["free","starter","pro"].includes(searchParams.get("plan") ?? "")) ? (searchParams.get("plan") as string) : "free";

  const [step, setStep]       = useState<Step>("plan");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [form, setForm]       = useState<FormData>({ planId: initialPlan, fullName: "", email: "", password: "", confirmPassword: "", orgName: "" });

  useEffect(() => {
    const p = searchParams.get("plan");
    if (p && ["free","starter","pro"].includes(p)) setForm(f => ({ ...f, planId: p }));
  }, [searchParams]);

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const stepIndex    = STEP_ORDER.indexOf(step);
  const selectedPlan = PLAN_META.find(p => p.id === form.planId) ?? PLAN_META[0]!;
  const pwStrength   = passwordStrength(form.password);

  function validateCurrent(): string {
    if (step === "account") {
      if (!form.fullName.trim() || form.fullName.trim().length < 2) return "Full name must be at least 2 characters";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email address";
      if (form.password.length < 8) return "Password must be at least 8 characters";
      if (form.password !== form.confirmPassword) return "Passwords do not match";
    }
    if (step === "org") {
      if (!form.orgName.trim() || form.orgName.trim().length < 2) return "Organisation name must be at least 2 characters";
    }
    return "";
  }

  function next() {
    const err = validateCurrent();
    if (err) { setError(err); return; }
    setError("");
    const i = STEP_ORDER.indexOf(step);
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]!);
  }

  function back() {
    setError("");
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]!);
  }

  async function handleSubmit() {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), password: form.password, fullName: form.fullName.trim(), orgName: form.orgName.trim(), planId: form.planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.token) setStoredToken(data.token);
      router.push(`/signup/verify?email=${encodeURIComponent(form.email)}&plan=${form.planId}`);
    } catch (err: unknown) {
      setError((err as Error).message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-20 flex items-start justify-center">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Clara AI</span>
          </Link>
          <h1 className="text-2xl font-black text-white mb-1">Create your account</h1>
          <p className="text-white/40 text-sm">14-day Pro trial included — no credit card needed</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-0 mb-8">
          {STEP_LABELS.map((label, i) => {
            const done = i < stepIndex; const cur = i === stepIndex;
            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${done ? "bg-emerald-500 text-white" : cur ? "bg-indigo-600 text-white" : "bg-white/[0.06] text-white/30"}`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div className={`text-[10px] mt-1 font-medium ${cur ? "text-white/70" : done ? "text-emerald-400/70" : "text-white/20"}`}>{label}</div>
                </div>
                {i < STEP_LABELS.length - 1 && <div className={`h-px flex-1 mx-1 transition-colors ${done ? "bg-emerald-500/40" : "bg-white/[0.06]"}`} />}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* Card */}
        <div className="border border-white/[0.08] bg-white/[0.03] rounded-2xl p-6">

          {/* Step: Plan */}
          {step === "plan" && (
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Choose your plan</h2>
              <p className="text-white/40 text-sm mb-5">All plans include a 14-day Pro trial.</p>
              <div className="space-y-3">
                {PLAN_META.map(plan => (
                  <button key={plan.id} onClick={() => setForm(f => ({ ...f, planId: plan.id }))}
                    className={`w-full text-left border rounded-xl p-4 transition-all ${form.planId === plan.id ? plan.ring + " " + plan.color : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.planId === plan.id ? "border-indigo-400" : "border-white/20"}`}>
                          {form.planId === plan.id && <div className="w-2 h-2 rounded-full bg-indigo-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{plan.name}</span>
                            {plan.badge && <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">{plan.badge}</span>}
                          </div>
                          <div className="text-xs text-white/40">{plan.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-white">{plan.price}</div>
                        <div className="text-xs text-white/30">after trial</div>
                      </div>
                    </div>
                    {form.planId === plan.id && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-white/[0.06]">
                        {plan.features.map(f => <span key={f} className="text-xs text-white/50 flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" />{f}</span>)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <Link href="/pricing" className="block text-center text-xs text-indigo-400 hover:text-indigo-300 mt-4 transition-colors">Compare all plans →</Link>
            </div>
          )}

          {/* Step: Account */}
          {step === "account" && (
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Your account</h2>
              <p className="text-white/40 text-sm mb-5">This will be your admin login.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Full name</label>
                  <input type="text" value={form.fullName} onChange={set("fullName")} placeholder="Jane Smith" autoComplete="name"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Work email</label>
                  <input type="email" value={form.email} onChange={set("email")} placeholder="jane@company.com" autoComplete="email"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="At least 8 characters" autoComplete="new-password"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1 flex-1">{[1,2,3,4,5].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= pwStrength.score ? pwStrength.color : "bg-white/10"}`} />)}</div>
                      <span className={`text-xs font-medium ${pwStrength.score >= 4 ? "text-emerald-400" : pwStrength.score >= 2 ? "text-amber-400" : "text-rose-400"}`}>{pwStrength.label}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Confirm password</label>
                  <div className="relative">
                    <input type={showCpw ? "text" : "password"} value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Repeat password" autoComplete="new-password"
                      className={`w-full bg-white/[0.05] border rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/20 focus:outline-none transition-colors ${form.confirmPassword && form.confirmPassword !== form.password ? "border-rose-500/60" : "border-white/10 focus:border-indigo-500"}`} />
                    <button type="button" onClick={() => setShowCpw(!showCpw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      {showCpw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.confirmPassword && form.confirmPassword !== form.password && <p className="text-xs text-rose-400 mt-1">Passwords do not match</p>}
                </div>
              </div>
            </div>
          )}

          {/* Step: Org */}
          {step === "org" && (
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Your organisation</h2>
              <p className="text-white/40 text-sm mb-5">This is your workspace name on Clara AI.</p>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Organisation name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input type="text" value={form.orgName} onChange={set("orgName")} placeholder="Acme Corp" autoComplete="organization"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                {form.orgName.trim() && (
                  <p className="text-xs text-white/30 mt-1.5">Slug: <span className="text-white/50 font-mono">{form.orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}</span></p>
                )}
              </div>
              <div className="mt-5 border border-white/[0.06] bg-white/[0.02] rounded-xl p-4 space-y-2">
                <div className="text-xs font-medium text-white/40 mb-2">Summary so far</div>
                <div className="flex justify-between text-xs"><span className="text-white/40">Plan</span><span className="text-white font-medium">{selectedPlan.name} <span className="text-white/30">(14-day trial)</span></span></div>
                <div className="flex justify-between text-xs"><span className="text-white/40">Email</span><span className="text-white/70 truncate max-w-[180px]">{form.email}</span></div>
              </div>
            </div>
          )}

          {/* Step: Review */}
          {step === "review" && (
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Review & confirm</h2>
              <p className="text-white/40 text-sm mb-5">Everything look right? Click create to go live.</p>
              <div className="space-y-3">
                {[
                  { label: "Plan",         value: `${selectedPlan.name} — ${selectedPlan.price} (after 14-day trial)`, icon: Zap },
                  { label: "Name",         value: form.fullName,  icon: User },
                  { label: "Email",        value: form.email,     icon: ArrowRight },
                  { label: "Organisation", value: form.orgName,   icon: Building2 },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3 border border-white/[0.06] bg-white/[0.02] rounded-xl px-4 py-3">
                    <row.icon className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-xs text-white/40 w-24 shrink-0">{row.label}</span>
                    <span className="text-sm text-white/80 truncate">{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/25 mt-4 leading-relaxed">
                By creating an account you agree to our{" "}
                <Link href="/terms" className="text-indigo-400 hover:text-indigo-300">Terms of Service</Link>{" "}and{" "}
                <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300">Privacy Policy</Link>.
              </p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center gap-3 mt-6">
            {step !== "plan" && (
              <button onClick={back} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors px-3 py-2.5">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            <div className="flex-1" />
            {step !== "review" ? (
              <button onClick={next} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all">
                {loading ? "Creating account…" : <><Check className="w-4 h-4" /> Create account</>}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/25 mt-5">
          Already have an account?{" "}
          <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
