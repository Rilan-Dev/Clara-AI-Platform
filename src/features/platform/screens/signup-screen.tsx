"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
  User,
  Zap,
} from "lucide-react";

import { setStoredToken } from "@/lib/client-auth";
import { apiFetchJson, apiUrl } from "@/lib/runtime";

type Step = "plan" | "account" | "org" | "review" | "verify";

type FormState = {
  planId: "free" | "starter" | "pro";
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  orgName: string;
};

type PlanMeta = {
  id: FormState["planId"];
  name: string;
  price: string;
  description: string;
  badge?: string;
  ring: string;
  color: string;
  features: string[];
};

const STEPS: Step[] = ["plan", "account", "org", "review", "verify"];
const STEP_LABELS = ["Plan", "Account", "Workspace", "Review", "Verify"];

const PLAN_META: PlanMeta[] = [
  {
    id: "free",
    name: "Free",
    price: "$0/mo",
    description: "For trying Clara with a small internal knowledge base.",
    ring: "ring-1 ring-border",
    color: "border-border bg-muted/50",
    features: ["1 knowledge base", "25 documents", "Basic chat"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$49/mo",
    description: "For small teams deploying their first assistant.",
    ring: "ring-2 ring-cyan-500/40",
    color: "border-cyan-500/30 bg-cyan-500/[0.06]",
    features: ["3 knowledge bases", "50 docs per KB", "Voice AI", "Team analytics"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$149/mo",
    description: "For production assistants with higher volume and branding needs.",
    badge: "Most popular",
    ring: "ring-2 ring-primary/50",
    color: "border-primary/40 bg-primary/10",
    features: ["10 knowledge bases", "200 docs per KB", "Custom branding", "Priority support"],
  },
];

const INITIAL_FORM: FormState = {
  planId: "pro",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  orgName: "",
};

function getPasswordStrength(password: string) {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: "Weak", color: "bg-rose-500" };
  if (score <= 3) return { score, label: "Medium", color: "bg-amber-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignupScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("plan");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // In-wizard email verification (final "Verify" step). The register call
  // leaves an authenticated session (token + cookie), so /api/auth/me can
  // be polled for emailVerified while the user clicks the emailed link in
  // their inbox (usually another tab).
  const [orgId, setOrgId] = useState("");
  const [verified, setVerified] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");

  const stepIndex = STEPS.indexOf(step);
  const selectedPlan = PLAN_META.find((plan) => plan.id === form.planId) ?? PLAN_META[2]!;
  const pwStrength = getPasswordStrength(form.password);

  function set(field: keyof FormState) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };
  }

  function validateCurrentStep() {
    if (step === "plan") {
      setError("");
      return true;
    }

    if (step === "account") {
      if (!form.fullName.trim()) {
        setError("Full name is required.");
        return false;
      }
      if (!isValidEmail(form.email)) {
        setError("Enter a valid work email address.");
        return false;
      }
      if (form.password.length < 8) {
        setError("Password must be at least 8 characters.");
        return false;
      }
      if (form.password !== form.confirmPassword) {
        setError("Passwords do not match.");
        return false;
      }
      setError("");
      return true;
    }

    if (step === "org") {
      if (form.orgName.trim().length < 2) {
        setError("Organisation name must be at least 2 characters.");
        return false;
      }
      setError("");
      return true;
    }

    setError("");
    return true;
  }

  function next() {
    if (!validateCurrentStep()) return;
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep) setStep(nextStep);
  }

  function back() {
    setError("");
    const previousStep = STEPS[stepIndex - 1];
    if (previousStep) setStep(previousStep);
  }

  async function handleSubmit() {
    if (!validateCurrentStep()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          orgName: form.orgName.trim(),
          planId: form.planId,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        token?: string;
        org?: { id: string };
      };

      if (!response.ok) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      if (data.token) {
        setStoredToken(data.token);
      }

      setOrgId(data.org?.id ?? "");
      // Stay inside the wizard: registration has already fired the
      // verification email (fire-and-forget, server-side); the final
      // "Verify" step watches for the link click and then routes on.
      setStep("verify");
    } catch (err: unknown) {
      setError((err as Error).message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Verify step: watch for the emailed link being clicked ────────────────
  useEffect(() => {
    if (step !== "verify" || verified) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await apiFetchJson<{ user?: { emailVerified?: boolean } }>("/api/auth/me", {
          cache: "no-store",
        });
        if (!cancelled && data?.user?.emailVerified) setVerified(true);
      } catch {
        // Transient poll failure — the next tick retries.
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, verified]);

  // Verified → show the success state briefly, then continue automatically.
  useEffect(() => {
    if (step !== "verify" || !verified) return;
    const timer = setTimeout(() => {
      if (form.planId !== "free" && orgId) {
        router.push(`/checkout?plan=${form.planId}&orgId=${orgId}`);
      } else if (form.planId !== "free") {
        router.push(`/checkout?plan=${form.planId}`);
      } else {
        router.push("/dashboard");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, verified, form.planId, orgId, router]);

  function continueAfterVerify() {
    if (form.planId !== "free" && orgId) {
      router.push(`/checkout?plan=${form.planId}&orgId=${orgId}`);
    } else if (form.planId !== "free") {
      router.push(`/checkout?plan=${form.planId}`);
    } else {
      router.push("/dashboard");
    }
  }

  async function handleResend() {
    setResending(true);
    setResendError("");
    try {
      // Always 200 (never leaks account existence); rate limited 3 / 10 min.
      const res = await fetch(apiUrl("/api/auth/resend-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not resend the email. Please try again shortly.");
      setResent(true);
      setTimeout(() => setResent(false), 6000);
    } catch (err: unknown) {
      setResendError((err as Error).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10 sm:py-20 flex items-start justify-center">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-foreground text-lg">Clara AI</span>
          </Link>
          <h1 className="text-2xl font-black text-foreground mb-1">Create your account</h1>
          <p className="text-muted-foreground text-sm">Choose a plan and get started right away</p>
        </div>

        <div className="flex items-center gap-0 mb-8">
          {STEP_LABELS.map((label, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;

            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      done
                        ? "bg-emerald-500 text-white"
                        : current
                          ? "bg-primary text-white"
                          : "bg-muted text-muted-foreground/70"
                    }`}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div
                    className={`text-[10px] mt-1 font-medium ${
                      current
                        ? "text-foreground/80"
                        : done
                          ? "text-emerald-600/70"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {label}
                  </div>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={`h-px flex-1 mx-1 transition-colors ${
                      done ? "bg-emerald-500/40" : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="border border-border bg-card rounded-2xl p-6">
          {step === "plan" && (
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Choose your plan</h2>
              <p className="text-muted-foreground text-sm mb-5">Your selected plan starts immediately.</p>
              <div className="space-y-3">
                {PLAN_META.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, planId: plan.id }))}
                    className={`w-full text-left border rounded-xl p-4 transition-all ${
                      form.planId === plan.id
                        ? `${plan.ring} ${plan.color}`
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            form.planId === plan.id ? "border-primary" : "border-muted-foreground/60"
                          }`}
                        >
                          {form.planId === plan.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">{plan.name}</span>
                            {plan.badge && (
                              <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                {plan.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{plan.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-foreground">{plan.price}</div>
                        <div className="text-xs text-muted-foreground/70">after trial</div>
                      </div>
                    </div>
                    {form.planId === plan.id && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border">
                        {plan.features.map((feature) => (
                          <span key={feature} className="text-xs text-muted-foreground flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            {feature}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <Link
                href="/pricing"
                className="block text-center text-xs text-primary hover:text-primary/80 mt-4 transition-colors"
              >
                Compare all plans -&gt;
              </Link>
            </div>
          )}

          {step === "account" && (
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Your account</h2>
              <p className="text-muted-foreground text-sm mb-5">This will be your admin login.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={set("fullName")}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Work email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="jane@company.com"
                    autoComplete="email"
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={set("password")}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 sm:py-2.5 pr-10 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1, 2, 3, 4, 5].map((index) => (
                          <div
                            key={index}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              index <= pwStrength.score ? pwStrength.color : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          pwStrength.score >= 4
                            ? "text-emerald-600"
                            : pwStrength.score >= 2
                              ? "text-amber-600"
                              : "text-destructive"
                        }`}
                      >
                        {pwStrength.label}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showCpw ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={set("confirmPassword")}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      className={`w-full bg-muted/50 border rounded-xl px-4 py-3 sm:py-2.5 pr-10 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors ${
                        form.confirmPassword && form.confirmPassword !== form.password
                          ? "border-destructive/60"
                          : "border-border focus:border-primary"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpw((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
                    >
                      {showCpw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.confirmPassword && form.confirmPassword !== form.password && (
                    <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "org" && (
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Your organisation</h2>
              <p className="text-muted-foreground text-sm mb-5">This is your workspace name on Clara AI.</p>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organisation name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={form.orgName}
                    onChange={set("orgName")}
                    placeholder="Acme Corp"
                    autoComplete="organization"
                    className="w-full bg-muted/50 border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                {form.orgName.trim() && (
                  <p className="text-xs text-muted-foreground/70 mt-1.5">
                    Slug:{" "}
                    <span className="text-muted-foreground font-mono">
                      {form.orgName
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-+|-+$/g, "")}
                    </span>
                  </p>
                )}
              </div>
              <div className="mt-5 border border-border/70 bg-surface rounded-xl p-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Summary so far</div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="text-foreground font-medium">{selectedPlan.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground/80 truncate max-w-[180px]">{form.email}</span>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Review &amp; confirm</h2>
              <p className="text-muted-foreground text-sm mb-5">
                {form.planId === "free"
                  ? "Everything look right? Click create to get started."
                  : "Everything look right? After verifying your email you'll choose your payment method."}
              </p>
              <div className="space-y-3">
                {[
                  {
                    label: "Plan",
                    value: `${selectedPlan.name} - ${selectedPlan.price}`,
                    icon: Zap,
                  },
                  { label: "Name", value: form.fullName, icon: User },
                  { label: "Email", value: form.email, icon: ArrowRight },
                  { label: "Organisation", value: form.orgName, icon: Building2 },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center gap-3 border border-border/70 bg-surface rounded-xl px-4 py-3"
                  >
                    <row.icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground w-24 shrink-0">{row.label}</span>
                    <span className="text-sm text-foreground/80 truncate">{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/70 mt-4 leading-relaxed">
                By creating an account you agree to our{" "}
                <Link href="/terms" className="text-primary hover:text-primary/80">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-primary hover:text-primary/80">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          )}

          {step === "verify" && (
            <div>
              <div className="flex flex-col items-center text-center mb-5">
                <div
                  className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 transition-colors ${
                    verified
                      ? "bg-emerald-500/15 border-emerald-500/30"
                      : "bg-primary/10 border-primary/20"
                  }`}
                >
                  {verified ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  ) : (
                    <Mail className="w-7 h-7 text-primary" />
                  )}
                </div>
                <h2 className="text-lg font-bold text-foreground mb-1">
                  {verified ? "Email verified" : "Verify your email"}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {verified ? (
                    "Your account is fully activated. Redirecting you now…"
                  ) : (
                    <>
                      We sent a verification link to{" "}
                      <span className="text-primary font-semibold break-all">{form.email}</span>. Click it
                      in your inbox to activate your account.
                    </>
                  )}
                </p>
              </div>

              {verified ? (
                <div className="flex items-center gap-2 bg-emerald-500/[0.06] border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 text-sm rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Welcome aboard — your {selectedPlan.name} plan{" "}
                    {form.planId === "free" ? "is active." : "is ready to activate."}
                  </span>
                </div>
              ) : (
                <>
                  <div className="border border-border/70 bg-surface rounded-xl p-4 space-y-2.5 mb-4">
                    {[
                      "Open the email from Clara AI (check your spam folder too)",
                      "Click the verification link — it's valid for 24 hours",
                      "This screen updates automatically once you're verified",
                    ].map((text, index) => (
                      <div key={text} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {index + 1}
                        </div>
                        <span className="text-xs text-muted-foreground">{text}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80 border border-dashed border-border rounded-xl px-4 py-3 mb-4">
                    <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Waiting for verification…
                  </div>

                  <div className="text-center mb-2">
                    {resent ? (
                      <p className="text-xs text-emerald-600 flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verification email resent — check your inbox.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resending}
                        className="text-xs text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {resending ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Resending…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" /> Resend verification email
                          </>
                        )}
                      </button>
                    )}
                    {resendError && <p className="text-xs text-destructive mt-1.5">{resendError}</p>}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            {step !== "plan" && step !== "verify" && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            <div className="flex-1" />
            {step === "verify" ? (
              verified ? (
                <button
                  type="button"
                  onClick={continueAfterVerify}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
                >
                  {form.planId === "free" ? "Continue to dashboard" : "Continue to payment"}{" "}
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={continueAfterVerify}
                  className="flex items-center gap-2 border border-border hover:border-primary/50 hover:text-primary text-muted-foreground font-medium px-6 py-2.5 rounded-xl text-sm transition-all"
                >
                  Skip for now <ArrowRight className="w-4 h-4" />
                </button>
              )
            ) : step !== "review" ? (
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl text-sm transition-all"
              >
                {loading ? (
                  "Creating account..."
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Create account
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/70 mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
