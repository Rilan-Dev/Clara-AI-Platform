"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Send, Eye, EyeOff, CheckCircle2, AlertCircle,
  Zap, Server, TestTube2, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/runtime";
import { savePlatformEnvSetting } from "@/lib/platform-env-client";
import { withAuthHeaders } from "@/lib/client-auth";

/**
 * EmailDeliveryPanel — Settings → Email Delivery
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets the platform admin switch the transactional email provider between
 * Resend (API) and SMTP (any server, e.g. Gmail with an app password). Only
 * ONE provider is active at a time — activating a card saves EMAIL_PROVIDER
 * and takes effect on the very next email (no restart).
 *
 * Also hosts the "send a test email" tool so configuration can be verified
 * end-to-end from this page.
 */

type EnvSetting = {
  key: string; value: string; isSet: boolean; description: string;
  category: string; isSecret: boolean; requiresRestart: boolean; updatedAt: string;
};

type FieldDef = {
  key: string; label: string; placeholder: string; isSecret: boolean;
  helpText?: string; wide?: boolean;
};

const MASK = "●●●●●●●●";

/* ── field definitions ──────────────────────────────────────────────────────── */

const COMMON_FIELDS: FieldDef[] = [
  { key: "EMAIL_FROM_NAME", label: "Sender name", placeholder: "Clara AI", isSecret: false, helpText: "Friendly name shown in recipients' inboxes." },
  { key: "EMAIL_FROM_ADDRESS", label: "Sender address (Resend)", placeholder: "noreply@yourdomain.com", isSecret: false, helpText: "Resend requires an address on a domain you verified in their dashboard." },
];

const RESEND_FIELDS: FieldDef[] = [
  { key: "RESEND_API_KEY", label: "API key", placeholder: "re_…", isSecret: true, helpText: "Resend Dashboard → API Keys. Server-side only.", wide: true },
];

const SMTP_FIELDS: FieldDef[] = [
  { key: "SMTP_HOST", label: "SMTP host", placeholder: "smtp.gmail.com", isSecret: false },
  { key: "SMTP_PORT", label: "Port", placeholder: "465", isSecret: false, helpText: "465 = SSL, 587 = STARTTLS." },
  { key: "SMTP_SECURE", label: "Use SSL", placeholder: "true", isSecret: false, helpText: "true for port 465, false for 587/STARTTLS." },
  { key: "SMTP_USER", label: "Username", placeholder: "you@gmail.com", isSecret: false, helpText: "Gmail: your full email address." },
  { key: "SMTP_PASSWORD", label: "Password / app password", placeholder: "16-character app password", isSecret: true, helpText: "Gmail: create one in Google Account → Security → 2-Step Verification → App passwords.", wide: true },
  { key: "SMTP_FROM_ADDRESS", label: "Sender address (SMTP)", placeholder: "you@gmail.com", isSecret: false, helpText: "Gmail requires this to match the authenticated account." },
];

/* ── helpers ────────────────────────────────────────────────────────────────── */

const saveSetting = savePlatformEnvSetting;

/* ── component ──────────────────────────────────────────────────────────────── */

export function EmailDeliveryPanel() {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  // Test-email state
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; provider: string; subject?: string; from?: string; error?: string } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/env"), { headers: withAuthHeaders() });
      const data = await res.json() as { settings: EnvSetting[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const emailSettings = (data.settings ?? []).filter((s) => s.category === "email");
      setSettings(emailSettings);
      const init: Record<string, string> = {};
      for (const s of emailSettings) {
        init[s.key] = s.isSecret ? "" : (s.value === MASK ? "" : s.value);
      }
      setValues(init);
      setInitialValues(init);
      if (!testTo) setTestTo(""); // keep user-entered recipient across reloads
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [testTo]);

  useEffect(() => { void load(); /* eslint-disable-line */ }, []);

  const getSetting = (key: string) => settings.find((s) => s.key === key);
  const activeProvider = (getSetting("EMAIL_PROVIDER")?.value ?? "console").toLowerCase();

  const ALL_FIELDS = [...COMMON_FIELDS, ...RESEND_FIELDS, ...SMTP_FIELDS];

  /** Dirty keys — a blank secret is "unchanged" (masked server-side). */
  const dirtyKeys = ALL_FIELDS.filter((f) => {
    const val = values[f.key] ?? "";
    if (f.isSecret && !val) return false;
    return val !== (initialValues[f.key] ?? "");
  });

  /** ONE save for the whole form (sender identity + both provider cards):
   *  fill everything in, then save once. Activation stays a separate
   *  explicit action per card. */
  const handleSaveAll = async () => {
    if (dirtyKeys.length === 0 || savingAll) return;
    setSavingAll(true);
    setError(null);
    setSavedAll(false);
    try {
      for (const f of dirtyKeys) {
        await saveSetting(f.key, values[f.key] ?? "");
      }
      setSavedAll(true);
      setTimeout(() => setSavedAll(false), 3000);
      await load();
    } catch (e) {
      setError(`Failed to save ${dirtyKeys[0]?.key ?? "settings"}: ${(e as Error).message}`);
    } finally {
      setSavingAll(false);
    }
  };

  const handleActivate = async (provider: "resend" | "smtp") => {
    setActivating(provider);
    setError(null);
    try {
      await saveSetting("EMAIL_PROVIDER", provider);
      await load();
    } catch (e) {
      setError(`Could not switch provider: ${(e as Error).message}`);
    } finally {
      setActivating(null);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/platform/email/test"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json() as {
        ok?: boolean; provider?: string; subject?: string; from?: string; error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Test send failed");
      setTestResult({
        ok: Boolean(data.ok),
        provider: data.provider ?? "?",
        subject: data.subject,
        from: data.from,
        error: data.error ?? undefined,
      });
    } catch (e) {
      setTestResult({ ok: false, provider: "?", error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 rounded-xl bg-muted animate-pulse" />
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
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
      <div key={field.key} className={`space-y-2 ${field.wide ? "sm:col-span-2" : ""}`}>
        <div className="flex items-center gap-2">
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
            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-primary/50 focus:outline-none"
          />
          {field.isSecret && (
            <button
              type="button"
              onClick={() => setVisibility((v) => ({ ...v, [field.key]: !v[field.key] }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              aria-label={showPassword ? "Hide" : "Show"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {field.helpText && <p className="text-xs text-muted-foreground/70">{field.helpText}</p>}
      </div>
    );
  };

  const providerCard = (
    provider: "resend" | "smtp",
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    fields: FieldDef[],
    configured: boolean,
  ) => {
    const isActive = activeProvider === provider;
    return (
      <div
        className={`rounded-2xl border p-5 sm:p-6 transition-colors shadow-sm ${
          isActive
            ? "border-primary/40 bg-gradient-to-br from-primary/10 to-secondary/5"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              isActive ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"
            }`}>
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {isActive && (
                  <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Active
                  </span>
                )}
                {!isActive && configured && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    Standby
                  </span>
                )}
                {!configured && (
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">
                    Not configured
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {!isActive && (
            <Button
              size="sm"
              onClick={() => void handleActivate(provider)}
              disabled={activating === provider}
              className="shrink-0"
            >
              {activating === provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Activate
            </Button>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">{fields.map(renderField)}</div>
      </div>
    );
  };

  const resendConfigured = getSetting("RESEND_API_KEY")?.isSet ?? false;
  const smtpConfigured =
    Boolean(getSetting("SMTP_HOST")?.isSet) &&
    Boolean(getSetting("SMTP_USER")?.isSet) &&
    Boolean(getSetting("SMTP_PASSWORD")?.isSet);

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-secondary/5 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">How email delivery works</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Clara sends transactional email (invitations, password resets, subscription
          notices) through exactly <strong className="text-foreground/70">one provider</strong> —
          activate a card below to switch. Credentials are stored encrypted in the
          platform settings and take effect on the next send, with no restart needed.
          Use the test tool at the bottom to verify delivery before relying on it.
        </p>
      </div>

      {/* Common sender fields */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Mail className="w-3.5 h-3.5" /> Sender identity
        </h3>
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">{COMMON_FIELDS.map(renderField)}</div>
        </div>
      </section>

      {/* Provider cards */}
      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Server className="w-3.5 h-3.5" /> Providers — one active at a time
        </h3>
        {providerCard(
          "resend",
          "Resend",
          "Modern email API — fastest to set up. Requires a verified domain.",
          <Send className="w-5 h-5" />,
          RESEND_FIELDS,
          resendConfigured,
        )}
        {providerCard(
          "smtp",
          "SMTP",
          "Any SMTP server — Gmail, Outlook, self-hosted. Uses your own mailbox.",
          <Server className="w-5 h-5" />,
          SMTP_FIELDS,
          smtpConfigured,
        )}
      </section>

      {/* ONE form-level Save — sender identity + both provider cards save
          together (credentials are batch-coherent; activation remains a
          per-card action above). */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-lg backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {savingAll
            ? "Saving…"
            : savedAll
              ? "All changes saved."
              : dirtyKeys.length > 0
                ? `${dirtyKeys.length} unsaved ${dirtyKeys.length === 1 ? "field" : "fields"} — enter everything, then save once.`
                : "No pending changes across sender identity, Resend and SMTP."}
        </p>
        <Button
          onClick={() => void handleSaveAll()}
          disabled={dirtyKeys.length === 0 || savingAll}
          className="shrink-0"
        >
          {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAll ? <CheckCircle2 className="w-4 h-4" /> : null}
          {savingAll
            ? "Saving…"
            : savedAll
              ? "Saved"
              : dirtyKeys.length === 1
                ? "Save 1 field"
                : `Save ${dirtyKeys.length} fields`}
        </Button>
      </div>

      {/* Test send */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <TestTube2 className="w-3.5 h-3.5" /> Verify with a test email
        </h3>
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <p className="text-xs text-muted-foreground">
            Sends a real message through the <strong className="text-foreground/70">{activeProvider === "smtp" ? "SMTP" : activeProvider === "resend" ? "Resend" : "configured provider"}</strong> provider
            {" "}to the address you enter — the same path every system email takes.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-primary/50 focus:outline-none"
            />
            <Button onClick={() => void sendTest()} disabled={testing || !testTo.trim()} className="shrink-0">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send test email
            </Button>
          </div>

          {testResult && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              testResult.ok
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
                : "border-destructive/25 bg-destructive/10 text-destructive"
            }`}>
              <div className="flex items-start gap-2">
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 w-4 h-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">
                    {testResult.ok
                      ? `Delivered via ${testResult.provider} — check the inbox.`
                      : `Send failed (${testResult.provider})`}
                  </p>
                  {testResult.subject && (
                    <p className="mt-0.5 truncate text-xs opacity-80">Subject: {testResult.subject}</p>
                  )}
                  {testResult.from && (
                    <p className="text-xs opacity-80">From: {testResult.from}</p>
                  )}
                  {testResult.error && (
                    <p className="mt-1 break-words text-xs opacity-90">{testResult.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
