"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink, Loader2, Landmark, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { savePlatformEnvSetting } from "@/lib/platform-env-client";
import { withAuthHeaders } from "@/lib/client-auth";

/* ── types ──────────────────────────────────────────────────────────────────── */

type EnvSetting = {
  key: string; value: string; isSet: boolean; description: string;
  category: string; isSecret: boolean; requiresRestart: boolean; updatedAt: string;
};

type FieldDef = {
  key: string; label: string; placeholder: string; isSecret: boolean;
  helpText?: string;
};

/* ── field definitions ──────────────────────────────────────────────────────── */

const STRIPE_FIELDS: FieldDef[] = [
  { key: "STRIPE_SECRET_KEY", label: "Secret Key", placeholder: "sk_test_…  or  sk_live_…", isSecret: true, helpText: "Server-side secret key from Stripe Dashboard → Developers → API Keys." },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook Secret", placeholder: "whsec_…", isSecret: true, helpText: "From Stripe → Developers → Webhooks → Signing Secret." },
  { key: "STRIPE_PRICE_STARTER", label: "Starter Price ID", placeholder: "price_…", isSecret: false, helpText: "Recurring Price ID for the Starter plan. Leave blank to use ad-hoc pricing." },
  { key: "STRIPE_PRICE_PRO", label: "Pro Price ID", placeholder: "price_…", isSecret: false, helpText: "Recurring Price ID for the Pro plan. Leave blank to use ad-hoc pricing." },
];

const RAZORPAY_FIELDS: FieldDef[] = [
  { key: "RAZORPAY_KEY_ID", label: "Key ID", placeholder: "rzp_test_… or rzp_live_…", isSecret: false, helpText: "Server-side Key ID from Razorpay Dashboard → Settings → API Keys." },
  { key: "RAZORPAY_KEY_SECRET", label: "Key Secret", placeholder: "Enter Razorpay key secret…", isSecret: true, helpText: "Server-side Key Secret (never exposed to browser)." },
  { key: "NEXT_PUBLIC_RAZORPAY_KEY_ID", label: "Public Key ID (Browser)", placeholder: "rzp_test_… or rzp_live_…", isSecret: false, helpText: "Browser-safe Key ID passed to Razorpay Checkout.js modal." },
  { key: "RAZORPAY_WEBHOOK_SECRET", label: "Webhook Secret", placeholder: "Enter webhook signing secret…", isSecret: true, helpText: "From Razorpay → Settings → Webhooks → Secret." },
];

const GENERAL_FIELDS: FieldDef[] = [
  { key: "NEXT_PUBLIC_APP_URL", label: "Public Application URL", placeholder: "https://app.example.com", isSecret: false, helpText: "The address customers use. Stripe success/cancel redirects and every link in Clara's emails are built from it — it must match your live domain." },
];

const MASK = "●●●●●●●●";

/* ── gateway status badge (A1) ───────────────────────────────────────────────── */

type GatewayStatus = "not_configured" | "configured" | "test" | "live";

const STATUS_BADGE: Record<GatewayStatus, { label: string; cls: string }> = {
  not_configured: { label: "Not configured", cls: "text-muted-foreground bg-muted border-border" },
  configured:     { label: "Configured",     cls: "text-primary bg-primary/10 border-primary/25" },
  test:           { label: "Test mode",      cls: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  live:           { label: "Live",           cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
};

function GatewayStatusBadge({ status }: { status: GatewayStatus }) {
  const s = STATUS_BADGE[status];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${s.cls}`}>
      {s.label}
    </span>
  );
}

type TestState = {
  status: "idle" | "testing" | "ok" | "error";
  mode?: "test" | "live";
  message?: string;
};

/* ── helpers ─────────────────────────────────────────────────────────────────── */

function validateSetting(key: string, value: string): string | null {
  const normalizedValue = value.trim();

  // Keep credentials deterministic: accidental leading/trailing whitespace must
  // never reach Stripe/Razorpay and produce a misleading "invalid API key" error.
  // Empty values pass here (clearing a field is a legal save once configured).
  if (key === "STRIPE_SECRET_KEY" && normalizedValue && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(normalizedValue)) {
    return "Invalid Stripe secret key format. Use the server-side sk_test_… or sk_live_… key from Stripe.";
  }
  if (key === "STRIPE_WEBHOOK_SECRET" && normalizedValue && !/^whsec_[A-Za-z0-9]+$/.test(normalizedValue)) {
    return "Invalid Stripe webhook secret format. Use the whsec_… signing secret from Stripe Webhooks.";
  }
  if (key.startsWith("STRIPE_PRICE_") && normalizedValue && !/^price_[A-Za-z0-9]+$/.test(normalizedValue)) {
    return "Invalid Stripe Price ID format. Use a price_… ID from the same Stripe account/mode.";
  }
  return null;
}

async function saveSetting(key: string, value: string): Promise<void> {
  const normalizedValue = value.trim();
  const invalid = validateSetting(key, normalizedValue);
  if (invalid) throw new Error(invalid);

  // Keep credentials deterministic: accidental leading/trailing whitespace must
  // never reach Stripe/Razorpay and produce a misleading "invalid API key" error.
  await savePlatformEnvSetting(key, normalizedValue);
}

/* ── component ──────────────────────────────────────────────────────────────── */

export function PaymentGatewayPanel() {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [gateway, setGateway] = useState<"stripe" | "razorpay">("stripe");
  const [testState, setTestState] = useState<Record<"stripe" | "razorpay", TestState>>({
    stripe:   { status: "idle" },
    razorpay: { status: "idle" },
  });

  /** Live credential check against the gateway itself (A2). Also returns
   *  the detected test/live mode — the authoritative signal for the badge,
   *  since secret key prefixes are masked in the settings API. */
  const runTest = async (g: "stripe" | "razorpay") => {
    setTestState(prev => ({ ...prev, [g]: { status: "testing" } }));
    try {
      const res = await fetch(apiUrl("/api/platform/payments/test"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ gateway: g }),
      });
      const data = await res.json() as { ok?: boolean; mode?: "test" | "live"; detail?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTestState(prev => ({ ...prev, [g]: { status: "ok", mode: data.mode, message: data.detail } }));
    } catch (e) {
      setTestState(prev => ({ ...prev, [g]: { status: "error", message: (e as Error).message } }));
    }
  };

  /** Badge state: required fields set? + mode (Razorpay key prefix is
   *  visible; Stripe mode comes from the last test-connection run). */
  const gatewayStatus = (g: "stripe" | "razorpay"): GatewayStatus => {
    if (g === "stripe") {
      const configured = !!(getSetting("STRIPE_SECRET_KEY")?.isSet && getSetting("STRIPE_WEBHOOK_SECRET")?.isSet);
      if (!configured) return "not_configured";
      const mode = testState.stripe.mode;
      return mode === "live" ? "live" : mode === "test" ? "test" : "configured";
    }
    const configured = !!(
      getSetting("RAZORPAY_KEY_ID")?.isSet &&
      getSetting("RAZORPAY_KEY_SECRET")?.isSet &&
      getSetting("NEXT_PUBLIC_RAZORPAY_KEY_ID")?.isSet
    );
    if (!configured) return "not_configured";
    const keyId = getSetting("RAZORPAY_KEY_ID")?.value ?? "";
    const mode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : testState.razorpay.mode;
    return mode === "live" ? "live" : mode === "test" ? "test" : "configured";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/env"), { headers: withAuthHeaders() });
      const data = await res.json() as { settings: EnvSetting[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const paymentSettings = (data.settings ?? []).filter(s => s.category === "payments");
      setSettings(paymentSettings);

      // initialize values — unmask non-secret values, secrets stay blank for editing
      const init: Record<string, string> = {};
      for (const s of paymentSettings) {
        init[s.key] = s.isSecret ? "" : (s.value === MASK ? "" : s.value);
      }
      setValues(init);
      setInitialValues(init);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const getSetting = (key: string) => settings.find(s => s.key === key);

  const ALL_FIELDS = [...STRIPE_FIELDS, ...RAZORPAY_FIELDS, ...GENERAL_FIELDS];

  /** Dirty keys — a blank secret is "unchanged" (masked server-side). */
  const dirtyKeys = ALL_FIELDS.filter((f) => {
    const val = values[f.key] ?? "";
    if (f.isSecret && !val) return false;
    return val !== (initialValues[f.key] ?? "");
  });

  /** ONE save for the whole form: validate every dirty field, then persist
   *  them sequentially through the two-step HMAC env flow. */
  const handleSaveAll = async () => {
    if (dirtyKeys.length === 0 || savingAll) return;
    const errors: Record<string, string> = {};
    for (const f of dirtyKeys) {
      const invalid = validateSetting(f.key, values[f.key] ?? "");
      if (invalid) errors[f.key] = invalid;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Fix the highlighted fields before saving.");
      return;
    }
    setSavingAll(true);
    setError(null);
    setSavedAll(false);
    try {
      for (const f of dirtyKeys) {
        await saveSetting(f.key, values[f.key] ?? "");
      }
      setSavedAll(true);
      setFieldErrors({});
      setTimeout(() => setSavedAll(false), 3000);
      await load();
    } catch (e) {
      setError(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSavingAll(false);
    }
  };

  const toggleVisibility = (key: string) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 rounded-xl bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  const renderField = (field: FieldDef) => {
    const setting = getSetting(field.key);
    const isConfigured = setting?.isSet ?? false;
    const value = values[field.key] ?? "";
    const showPassword = visibility[field.key] ?? false;

    return (
      <div key={field.key} className="space-y-2">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <label className="text-sm font-medium text-foreground/80">{field.label}</label>
          {field.isSecret && <Badge variant="outline" className="text-[11px] py-0">secret</Badge>}
          {isConfigured && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> configured
            </span>
          )}
        </div>

        <div className="relative">
          <input
            type={field.isSecret && !showPassword ? "password" : "text"}
            value={value}
            onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className={`w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground/80 placeholder:text-muted-foreground/80 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10 ${
              fieldErrors[field.key]
                ? "border-destructive/60 focus:border-destructive focus:ring-destructive/30"
                : "border-input focus:border-primary/50"
            }`}
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {field.isSecret && (
              <button
                onClick={() => toggleVisibility(field.key)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground/70 transition-colors"
                title={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {fieldErrors[field.key] ? (
          <p className="text-xs text-destructive">{fieldErrors[field.key]}</p>
        ) : field.helpText ? (
          <p className="text-xs text-muted-foreground/70">{field.helpText}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <CreditCard className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Payment Gateway Configuration</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure Stripe (USD) and Razorpay (INR) credentials. Fill in everything, then save once — changes take effect immediately, no restart required.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Gateway tabs — SVG icons + live status badges */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted border border-border">
        <button
          type="button"
          onClick={() => setGateway("stripe")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            gateway === "stripe"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <CreditCard className="w-4 h-4" /> Stripe (USD)
            <GatewayStatusBadge status={gatewayStatus("stripe")} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setGateway("razorpay")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            gateway === "razorpay"
              ? "bg-sky-500/10 text-sky-600 border border-sky-500/30"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <Landmark className="w-4 h-4" /> Razorpay (INR)
            <GatewayStatusBadge status={gatewayStatus("razorpay")} />
          </span>
        </button>
      </div>

      {/* Fields */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
        {gateway === "stripe" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="w-3.5 h-3.5" />
                <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
                   className="text-primary hover:text-primary/80 underline underline-offset-2">
                  Open Stripe Dashboard →
                </a>
              </div>
              <button type="button" onClick={() => void runTest("stripe")}
                disabled={testState.stripe.status === "testing"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-60 min-h-[36px]">
                {testState.stripe.status === "testing"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PlugZap className="w-3.5 h-3.5" />}
                Test connection
              </button>
            </div>
            {testState.stripe.status === "ok" && testState.stripe.message && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {testState.stripe.message}
              </div>
            )}
            {testState.stripe.status === "error" && testState.stripe.message && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {testState.stripe.message}
              </div>
            )}
            <WebhookHint
              gateway="Stripe"
              path="/api/webhooks/stripe"
              where="Stripe → Developers → Webhooks → Add endpoint (in test and live mode separately)"
              events={["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_succeeded", "invoice.payment_failed"]}
            />
            {STRIPE_FIELDS.map(renderField)}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="w-3.5 h-3.5" />
                <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noopener noreferrer"
                   className="text-sky-600 hover:text-sky-500 underline underline-offset-2">
                  Open Razorpay Dashboard →
                </a>
              </div>
              <button type="button" onClick={() => void runTest("razorpay")}
                disabled={testState.razorpay.status === "testing"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-60 min-h-[36px]">
                {testState.razorpay.status === "testing"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PlugZap className="w-3.5 h-3.5" />}
                Test connection
              </button>
            </div>
            {testState.razorpay.status === "ok" && testState.razorpay.message && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {testState.razorpay.message}
              </div>
            )}
            {testState.razorpay.status === "error" && testState.razorpay.message && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {testState.razorpay.message}
              </div>
            )}
            <WebhookHint
              gateway="Razorpay"
              path="/api/webhooks/razorpay"
              where="Razorpay → Settings → Webhooks → Add new webhook"
              events={["payment.captured", "payment.failed", "subscription.charged", "subscription.cancelled", "subscription.halted"]}
            />
            {RAZORPAY_FIELDS.map(renderField)}
          </>
        )}
      </div>

      {/* General fields */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
        <h3 className="text-sm font-semibold text-muted-foreground">General</h3>
        {GENERAL_FIELDS.map(renderField)}
      </div>

      {/* ONE form-level Save — enter everything, review, save once.
          Per-input save icons are deliberately gone (platform save policy). */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-lg backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {savingAll
            ? "Saving…"
            : savedAll
              ? "All changes saved."
              : dirtyKeys.length > 0
                ? `${dirtyKeys.length} unsaved ${dirtyKeys.length === 1 ? "change" : "changes"} — review the highlighted fields, then save once.`
                : "No pending changes across Stripe, Razorpay and General."}
        </p>
        <Button
          onClick={() => void handleSaveAll()}
          disabled={dirtyKeys.length === 0 || savingAll}
          className="shrink-0"
        >
          {savingAll ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : savedAll ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : null}
          {savingAll
            ? "Saving…"
            : savedAll
              ? "Saved"
              : dirtyKeys.length === 1
                ? "Save 1 change"
                : `Save ${dirtyKeys.length} changes`}
        </Button>
      </div>

      {/* Info notice */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-4 py-3 text-xs text-amber-600">
        <p className="font-medium flex items-center gap-1.5"><PlugZap className="w-3.5 h-3.5" /> Live runtime configuration</p>
        <p className="mt-1">
          Payment credential changes are applied immediately to <code className="font-mono text-amber-700">process.env</code> and
          take effect on the next API call. The Stripe/Razorpay SDK singletons automatically detect key changes.
        </p>
      </div>
    </div>
  );
}

/** The webhook URL to register with the gateway — without it, payments are
 *  only confirmed when the customer returns to the success page. */
function WebhookHint({ gateway, path, where, events }: { gateway: string; path: string; where: string; events: string[] }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
      <p className="text-sm font-medium text-foreground">Register this webhook in {gateway}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground" title={url}>{url}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {where}. Send these events: {events.join(", ")}. Then paste its signing secret below.
      </p>
    </div>
  );
}
