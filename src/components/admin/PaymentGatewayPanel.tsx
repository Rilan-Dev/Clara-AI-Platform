"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, Eye, EyeOff, Save, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
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
  { key: "NEXT_PUBLIC_APP_URL", label: "Public Application URL", placeholder: "https://app.example.com", isSecret: false, helpText: "Base URL for payment callbacks, success redirects, and webhook endpoints." },
];

const MASK = "●●●●●●●●";

/* ── helpers ─────────────────────────────────────────────────────────────────── */

async function saveSetting(key: string, value: string): Promise<void> {
  const normalizedValue = value.trim();

  // Keep credentials deterministic: accidental leading/trailing whitespace must
  // never reach Stripe/Razorpay and produce a misleading "invalid API key" error.
  if (key === "STRIPE_SECRET_KEY" && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(normalizedValue)) {
    throw new Error("Invalid Stripe secret key format. Use the server-side sk_test_… or sk_live_… key from Stripe.");
  }
  if (key === "STRIPE_WEBHOOK_SECRET" && !/^whsec_[A-Za-z0-9]+$/.test(normalizedValue)) {
    throw new Error("Invalid Stripe webhook secret format. Use the whsec_… signing secret from Stripe Webhooks.");
  }
  if (key.startsWith("STRIPE_PRICE_") && normalizedValue && !/^price_[A-Za-z0-9]+$/.test(normalizedValue)) {
    throw new Error("Invalid Stripe Price ID format. Use a price_… ID from the same Stripe account/mode.");
  }

  // Step 1: get HMAC confirmation token
  const tokenRes = await fetch(
    apiUrl(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(normalizedValue)}`),
    { headers: withAuthHeaders() },
  );
  const tokenData = await tokenRes.json() as { confirmation_token?: string; timestamp?: number; error?: string };
  if (!tokenRes.ok || !tokenData.confirmation_token)
    throw new Error(tokenData.error ?? "Could not create confirmation token");

  // Step 2: save with token
  const res = await fetch(apiUrl("/api/platform/env"), {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      key, value: normalizedValue,
      confirmation_token: tokenData.confirmation_token,
      timestamp: tokenData.timestamp,
    }),
  });
  const data = await res.json() as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to save");
}

/* ── component ──────────────────────────────────────────────────────────────── */

export function PaymentGatewayPanel() {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateway, setGateway] = useState<"stripe" | "razorpay">("stripe");

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const getSetting = (key: string) => settings.find(s => s.key === key);

  const handleSave = async (key: string) => {
    const val = values[key] ?? "";
    setSaving(key);
    setError(null);
    setSaved(null);
    try {
      await saveSetting(key, val);
      setSaved(key);
      setTimeout(() => setSaved(null), 3000);
      await load();
    } catch (e) {
      setError(`Failed to save ${key}: ${(e as Error).message}`);
    } finally {
      setSaving(null);
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
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground/80">{field.label}</label>
          {field.isSecret && <Badge variant="outline" className="text-[10px] py-0">secret</Badge>}
          {isConfigured && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
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
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground/80 placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-20"
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSave(field.key)}
              disabled={saving === field.key || !value}
              className="h-7 px-2 text-xs"
            >
              {saving === field.key ? (
                <span className="animate-spin">⏳</span>
              ) : saved === field.key ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>

        {field.helpText && (
          <p className="text-xs text-muted-foreground/70">{field.helpText}</p>
        )}
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
            Configure Stripe (USD) and Razorpay (INR) credentials. Changes take effect immediately — no restart required.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Gateway tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted border border-border">
        <button
          onClick={() => setGateway("stripe")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            gateway === "stripe"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            💳 Stripe (USD)
            {settings.find(s => s.key === "STRIPE_SECRET_KEY")?.isSet && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            )}
          </span>
        </button>
        <button
          onClick={() => setGateway("razorpay")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            gateway === "razorpay"
              ? "bg-sky-500/10 text-sky-600 border border-sky-500/30"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            🏦 Razorpay (INR)
            {settings.find(s => s.key === "RAZORPAY_KEY_ID")?.isSet && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            )}
          </span>
        </button>
      </div>

      {/* Fields */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
        {gateway === "stripe" ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
              <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
                 className="text-primary hover:text-primary/80 underline underline-offset-2">
                Open Stripe Dashboard →
              </a>
            </div>
            {STRIPE_FIELDS.map(renderField)}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
              <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noopener noreferrer"
                 className="text-sky-600 hover:text-sky-500 underline underline-offset-2">
                Open Razorpay Dashboard →
              </a>
            </div>
            {RAZORPAY_FIELDS.map(renderField)}
          </>
        )}
      </div>

      {/* General fields */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
        <h3 className="text-sm font-semibold text-muted-foreground">General</h3>
        {GENERAL_FIELDS.map(renderField)}
      </div>

      {/* Info notice */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-4 py-3 text-xs text-amber-600">
        <p className="font-medium">⚡ Live runtime configuration</p>
        <p className="mt-1">
          Payment credential changes are applied immediately to <code className="font-mono text-amber-700">process.env</code> and
          take effect on the next API call. The Stripe/Razorpay SDK singletons automatically detect key changes.
        </p>
      </div>
    </div>
  );
}
