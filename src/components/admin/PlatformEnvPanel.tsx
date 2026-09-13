"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, AlertCircle, ExternalLink, Bot, CreditCard, Smartphone, Globe } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type EnvSetting = {
  key: string;
  value: string;
  isSet: boolean;
  description: string;
  category: string;
  isSecret: boolean;
  requiresRestart: boolean;
  updatedAt: string;
};

const MASK = "●●●●●●●●";

// Predefined model/voice options for dropdowns (custom entry always allowed)
const OPENAI_CHAT_MODELS = [
  "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol",
  "gpt-4o", "gpt-4o-mini", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20",
  "gpt-4-turbo", "gpt-4-turbo-preview", "gpt-4-0125-preview",
  "gpt-3.5-turbo", "gpt-3.5-turbo-0125"
];
const OPENAI_EMBEDDING_MODELS = [
  "text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"
];
const OPENAI_REALTIME_MODELS = [
  "gpt-realtime-2.1-mini", "gpt-realtime-2025-08-28",
  "gpt-4o-realtime-preview", "gpt-4o-realtime-preview-2024-12-17", "gpt-4o-realtime-preview-2024-10-01",
  "gpt-4o-mini-realtime-preview", "gpt-4o-mini-realtime-preview-2024-12-17"
];
const OPENAI_TRANSCRIPTION_MODELS = [
  "gpt-realtime-whisper", "gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"
];
const OPENAI_REALTIME_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "shimmer",
  "verse", "marin", "cedar", "sage"
];

const GEMINI_CHAT_MODELS = [
  "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-pro",
  "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b"
];
const GEMINI_EMBEDDING_MODELS = [
  "gemini-embedding-001", "text-embedding-004", "embedding-001"
];
const GEMINI_REALTIME_MODELS = [
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.0-flash-native-audio-preview",
  "gemini-2.0-flash-exp-native-audio"
];
const GEMINI_TRANSCRIPTION_MODELS = [
  "gemini-2.5-flash", "gemini-2.0-flash"
];
const GEMINI_VOICES = [
  "Aoede", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Zephyr"
];

// Field metadata for rendering
interface FieldMeta {
  label: string;
  placeholder: string;
  hint?: string;
  validation?: (value: string) => string | null;
  type?: "text" | "password" | "number" | "url" | "select";
  options?: string[];
  relatedKey?: string;
  group?: string;
  isSecret?: boolean;
  helperLink?: { label: string; href: string };
  deprecated?: boolean;
  deprecationHint?: string;
}

const FIELD_METADATA: Record<string, FieldMeta> = {
  // ── AI ─────────────────────────────────────────────────────────────
  AI_PROVIDER: {
    label: "AI Provider",
    placeholder: "Select provider",
    hint: "Switch between OpenAI and Gemini. Requires valid API key for selected provider.",
    type: "select",
    options: ["openai", "gemini"],
    group: "Provider",
  },
  OPENAI_API_KEY: {
    label: "API Key", placeholder: "sk-...", hint: "Server-side secret key from platform.openai.com",
    type: "password", isSecret: true, group: "OpenAI",
    helperLink: { label: "OpenAI Dashboard →", href: "https://platform.openai.com/api-keys" },
  },
  OPENAI_CHAT_MODEL: {
    label: "Chat Model", placeholder: "Select or type model",
    hint: "Model used for chat completions",
    type: "select", options: OPENAI_CHAT_MODELS, group: "OpenAI",
  },
  OPENAI_EMBEDDING_MODEL: {
    label: "Embedding Model", placeholder: "Select or type model",
    hint: "Model used for document embeddings (must match vector dimension)",
    type: "select", options: OPENAI_EMBEDDING_MODELS, group: "OpenAI",
  },
  OPENAI_REALTIME_MODEL: {
    label: "Realtime Model", placeholder: "Select or type model",
    hint: "Model for voice/realtime sessions",
    type: "select", options: OPENAI_REALTIME_MODELS, group: "OpenAI",
  },
  OPENAI_TRANSCRIPTION_MODEL: {
    label: "Transcription Model", placeholder: "Select or type model",
    hint: "Model for speech-to-text in realtime sessions",
    type: "select", options: OPENAI_TRANSCRIPTION_MODELS, group: "OpenAI",
  },
  OPENAI_DEFAULT_VOICE: {
    label: "Default Voice", placeholder: "Select or type voice",
    hint: "Default voice for TTS output",
    type: "select", options: OPENAI_REALTIME_VOICES, group: "OpenAI",
  },
  GEMINI_API_KEY: {
    label: "API Key", placeholder: "AIza...", hint: "Server-side secret key from aistudio.google.com",
    type: "password", isSecret: true, group: "Gemini",
    helperLink: { label: "Google AI Studio →", href: "https://aistudio.google.com/apikey" },
  },
  GEMINI_CHAT_MODEL: {
    label: "Chat Model", placeholder: "Select or type model",
    hint: "Model used for chat completions",
    type: "select", options: GEMINI_CHAT_MODELS, group: "Gemini",
  },
  GEMINI_EMBEDDING_MODEL: {
    label: "Embedding Model", placeholder: "Select or type model",
    hint: "Model used for document embeddings",
    type: "select", options: GEMINI_EMBEDDING_MODELS, group: "Gemini",
  },
  GEMINI_REALTIME_MODEL: {
    label: "Realtime Model", placeholder: "Select or type model",
    hint: "Model for voice/realtime sessions (Live API)",
    type: "select", options: GEMINI_REALTIME_MODELS, group: "Gemini",
  },
  GEMINI_TRANSCRIPTION_MODEL: {
    label: "Transcription Model", placeholder: "Select or type model",
    hint: "Model for speech-to-text",
    type: "select", options: GEMINI_TRANSCRIPTION_MODELS, group: "Gemini",
  },
  GEMINI_DEFAULT_VOICE: {
    label: "Default Voice", placeholder: "Select or type voice",
    hint: "Default voice for TTS output",
    type: "select", options: GEMINI_VOICES, group: "Gemini",
  },
  AI_MAX_CHAT_TOKENS: {
    label: "Max Chat Tokens", placeholder: "4000", hint: "Maximum tokens per chat completion request",
    type: "number", validation: (v) => /^\d+$/.test(v) ? null : "Must be a positive integer",
    group: "Limits",
  },
  AI_MAX_REALTIME_TOKENS: {
    label: "Max Realtime Tokens", placeholder: "1000", hint: "Maximum tokens per realtime/voice request",
    type: "number", validation: (v) => /^\d+$/.test(v) ? null : "Must be a positive integer",
    group: "Limits",
  },
  AI_MAX_TEMPERATURE: {
    label: "Max Temperature", placeholder: "1.0", hint: "Maximum sampling temperature (0-2)",
    type: "number", validation: (v) => { const n = parseFloat(v); return (n >= 0 && n <= 2) ? null : "Must be between 0 and 2" },
    group: "Limits",
  },

  // ── Payments ──────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: {
    label: "Secret Key", placeholder: "sk_test_... or sk_live_...", hint: "Server-side secret key from Stripe Dashboard",
    type: "password", isSecret: true, group: "Stripe",
    helperLink: { label: "Stripe API Keys →", href: "https://dashboard.stripe.com/apikeys" },
  },
  STRIPE_WEBHOOK_SECRET: {
    label: "Webhook Secret", placeholder: "whsec_...", hint: "Signing secret from Stripe webhook endpoint",
    type: "password", isSecret: true, group: "Stripe",
    helperLink: { label: "Stripe Webhooks →", href: "https://dashboard.stripe.com/webhooks" },
  },
  STRIPE_PRICE_STARTER: {
    label: "Starter Plan Price ID", placeholder: "price_...", hint: "Managed on Subscriptions page — not edited here",
    type: "text", deprecated: true, deprecationHint: "Plan pricing is now managed on the Subscriptions page. This field is kept for legacy reference only.",
    group: "Stripe (Legacy)",
  },
  STRIPE_PRICE_PRO: {
    label: "Pro Plan Price ID", placeholder: "price_...", hint: "Managed on Subscriptions page — not edited here",
    type: "text", deprecated: true, deprecationHint: "Plan pricing is now managed on the Subscriptions page. This field is kept for legacy reference only.",
    group: "Stripe (Legacy)",
  },

  // Razorpay — paired fields with clear public/secret distinction
  RAZORPAY_KEY_ID: {
    label: "Key ID (Server)", placeholder: "rzp_test_... or rzp_live_...", hint: "Server-side Key ID from Razorpay Dashboard",
    type: "text", isSecret: false, group: "Razorpay",
    relatedKey: "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    helperLink: { label: "Razorpay API Keys →", href: "https://dashboard.razorpay.com/app/keys" },
  },
  NEXT_PUBLIC_RAZORPAY_KEY_ID: {
    label: "Key ID (Public / Browser)", placeholder: "rzp_test_... or rzp_live_...", hint: "Client-safe Key ID passed to Razorpay Checkout.js. Usually identical to server Key ID.",
    type: "text", isSecret: false, group: "Razorpay",
    relatedKey: "RAZORPAY_KEY_ID",
  },
  RAZORPAY_KEY_SECRET: {
    label: "Key Secret", placeholder: "Enter key secret…", hint: "Server-side secret (never exposed to browser)",
    type: "password", isSecret: true, group: "Razorpay",
  },
  RAZORPAY_WEBHOOK_SECRET: {
    label: "Webhook Secret", placeholder: "Enter webhook signing secret…", hint: "From Razorpay → Settings → Webhooks → Secret",
    type: "password", isSecret: true, group: "Razorpay",
    helperLink: { label: "Razorpay Webhooks →", href: "https://dashboard.razorpay.com/app/webhooks" },
  },

  // ── Platform ──────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: {
    label: "Public App URL", placeholder: "https://your-domain.com", hint: "Base URL for payment callbacks, redirects, and webhook endpoints",
    type: "url", group: "Platform",
  },
  NEXT_PUBLIC_LANDING_EMBED_API_KEY: {
    label: "Landing Embed API Key", placeholder: "clr_...", hint: "Public API key for landing page embed widget",
    type: "text", group: "Platform",
  },

  // ── Phone ─────────────────────────────────────────────────────────
  PHONE_PROVIDER: {
    label: "Phone Provider", placeholder: "Select provider", hint: "Active voice provider for phone calls",
    type: "select", options: ["twilio", "vonage"], group: "Provider",
  },
  TWILIO_ACCOUNT_SID: { label: "Account SID", placeholder: "AC...", hint: "Twilio Account SID from Console", type: "text", group: "Twilio" },
  TWILIO_AUTH_TOKEN: { label: "Auth Token", placeholder: "...", hint: "Twilio Auth Token from Console", type: "password", isSecret: true, group: "Twilio" },
  TWILIO_PHONE_NUMBER: { label: "Phone Number", placeholder: "+15551234567", hint: "E.164 format phone number from Twilio", type: "text", group: "Twilio" },
  VONAGE_API_KEY: { label: "API Key", placeholder: "...", hint: "Vonage API Key from Dashboard", type: "text", group: "Vonage" },
  VONAGE_API_SECRET: { label: "API Secret", placeholder: "...", hint: "Vonage API Secret from Dashboard", type: "password", isSecret: true, group: "Vonage" },
  VONAGE_PHONE_NUMBER: { label: "Phone Number", placeholder: "+15551234567", hint: "E.164 format phone number from Vonage", type: "text", group: "Vonage" },
};

const CATEGORIES = ["ai", "payments", "phone", "platform"] as const;
const CATEGORY_LABELS: Record<typeof CATEGORIES[number], { icon: React.ReactNode; title: string; description: string }> = {
  ai: { icon: <Bot className="w-5 h-5" />, title: "AI Configuration (Centralized)", description: "Provider, models, API keys, token limits. Applies globally to all organisations, projects, KBs and assistants. Orgs can only override Identity, Behaviour, Language & Voice." },
  payments: { icon: <CreditCard className="w-5 h-5" />, title: "Payment Gateway Configuration", description: "Stripe (USD) and Razorpay (INR) credentials. Plan pricing is managed on the Subscriptions page — not here." },
  phone: { icon: <Smartphone className="w-5 h-5" />, title: "Phone Configuration", description: "Twilio or Vonage credentials for voice calling. Select active provider above." },
  platform: { icon: <Globe className="w-5 h-5" />, title: "Platform Configuration", description: "Public app URL and landing embed key." },
};

// Category → which keys belong
const CATEGORY_KEYS: Record<typeof CATEGORIES[number], string[]> = {
  ai: [
    "AI_PROVIDER",
    "OPENAI_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_EMBEDDING_MODEL", "OPENAI_REALTIME_MODEL", "OPENAI_TRANSCRIPTION_MODEL", "OPENAI_DEFAULT_VOICE",
    "GEMINI_API_KEY", "GEMINI_CHAT_MODEL", "GEMINI_EMBEDDING_MODEL", "GEMINI_REALTIME_MODEL", "GEMINI_TRANSCRIPTION_MODEL", "GEMINI_DEFAULT_VOICE",
    "AI_MAX_CHAT_TOKENS", "AI_MAX_REALTIME_TOKENS", "AI_MAX_TEMPERATURE",
  ],
  payments: [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "RAZORPAY_KEY_ID", "NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    // Legacy price IDs — shown collapsed
    "STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO",
  ],
  phone: [
    "PHONE_PROVIDER",
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
    "VONAGE_API_KEY", "VONAGE_API_SECRET", "VONAGE_PHONE_NUMBER",
  ],
  platform: [
    "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_LANDING_EMBED_API_KEY",
  ],
};

export function PlatformEnvPanel() {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<typeof CATEGORIES[number] | "all">("ai");
  const [showEmptyFields, setShowEmptyFields] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/env"), {
        headers: withAuthHeaders(),
      });
      const data = (await res.json()) as {
        settings: EnvSetting[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
      setSettings(data.settings ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const meta = FIELD_METADATA;

  const validateInput = (key: string, value: string) => {
    const m = meta[key];
    if (m?.validation) return m.validation(value);
    return null;
  };

  const startEdit = (key: string, value: string) => {
    setEditing(key);
    setNewValue(value === MASK ? "" : value);
    setConfirm(false);
    setError(null);
    setSuccess(null);
    setValidationError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setNewValue("");
    setConfirm(false);
    setError(null);
    setValidationError(null);
  };

  const handleValueChange = (val: string) => {
    setNewValue(val);
    const err = validateInput(editing!, val);
    setValidationError(err);
  };

  const saveEdit = async (key: string) => {
    if (!confirm) {
      setError("Please confirm you want to apply this change.");
      return;
    }
    const err = validateInput(key, newValue);
    if (err) {
      setValidationError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tokenRes = await fetch(
        apiUrl(
          `/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(newValue)}`,
        ),
        { headers: withAuthHeaders() },
      );
      const tokenData = (await tokenRes.json()) as {
        confirmation_token?: string;
        timestamp?: number;
        error?: string;
      };
      if (!tokenRes.ok || !tokenData.confirmation_token)
        throw new Error(
          tokenData.error ?? "Could not create confirmation token",
        );
      const res = await fetch(apiUrl("/api/platform/env"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          key,
          value: newValue,
          confirmation_token: tokenData.confirmation_token,
          timestamp: tokenData.timestamp,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess(`${key} updated successfully.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Build lookup for quick access - always called, not conditional
  const settingMap = useMemo(() => new Map(settings.map(s => [s.key, s])), [settings]);

  if (loading)
    return <div className="animate-pulse h-32 rounded-xl bg-muted/30" />;

  // Helper to render a single field in view or edit mode
  const renderField = (key: string, category: string, isLegacy: boolean = false) => {
    const s = settingMap.get(key);
    const m = meta[key];
    if (!s && !m) return null; // field not in metadata

    const value = s?.value || "";
    const isSet = s?.isSet ?? Boolean(value);
    const isSecret = s?.isSecret ?? m?.isSecret ?? false;
    const showRelated = m?.relatedKey && settingMap.has(m.relatedKey);
    const relatedItem = showRelated ? settingMap.get(m.relatedKey!) : null;

    const isEditing = editing === key;

    const InputComponent = (() => {
      if (m?.type === "select" && m.options) {
        return (
          <Select value={newValue} onValueChange={handleValueChange} disabled={saving}>
            <SelectTrigger className={`w-full ${validationError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}>
              <SelectValue placeholder={m.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {m.options.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      if (m?.type === "password" || isSecret) {
        return (
          <input
            type="password"
            value={newValue}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={m?.placeholder || "Enter new secret value…"}
            className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono ${validationError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            autoFocus
            disabled={saving}
          />
        );
      }
      if (m?.type === "number") {
        return (
          <input
            type="number"
            value={newValue}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={m?.placeholder || "Enter value…"}
            className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono ${validationError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            autoFocus
            disabled={saving}
          />
        );
      }
      if (m?.type === "url") {
        return (
          <input
            type="url"
            value={newValue}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={m?.placeholder || "Enter value…"}
            className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono ${validationError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
            autoFocus
            disabled={saving}
          />
        );
      }
      // default text
      return (
        <input
          type="text"
          value={newValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder={m?.placeholder || "Enter value…"}
          className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono ${validationError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
          autoFocus
          disabled={saving}
        />
      );
    })();

    if (isEditing) {
      return (
        <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono font-semibold text-primary">{key}</code>
            {isSecret && <Badge variant="secondary" className="text-[10px]">secret</Badge>}
            {m?.deprecated && <Badge variant="destructive" className="text-[10px]">legacy</Badge>}
          </div>
          <Label className="text-sm font-medium">{m?.label || key}</Label>
          {InputComponent}
          {m?.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}
          {m?.deprecationHint && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {m.deprecationHint}
            </p>
          )}
          {showRelated && relatedItem && (
            <p className="text-xs text-cyan-400 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              Paired with <code className="bg-muted px-1 rounded">{m.relatedKey}</code> (currently: {relatedItem.isSecret ? (relatedItem.isSet ? "✓ Configured" : "✗ Not set") : relatedItem.value || "(empty)"})
            </p>
          )}
          {m?.helperLink && (
            <a href={m.helperLink.href} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-1">
              {m.helperLink.label}
            </a>
          )}
          {validationError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {validationError}
            </p>
          )}
          <div className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2 text-xs text-warning flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">This updates the live runtime configuration immediately.</p>
              <p className="mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary/20"
                  />
                  I confirm this change
                </label>
              </p>
            </div>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={() => saveEdit(key)} disabled={saving || !confirm || !!validationError}>
              {saving ? "Saving…" : "Apply change"}
            </Button>
          </div>
        </div>
      );
    }

    // View mode
    return (
      <div className={`flex items-center justify-between gap-4 p-3 ${isLegacy ? "opacity-60" : ""}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono font-semibold">{key}</code>
            {isSecret && <Badge variant="secondary" className="text-[10px]">secret</Badge>}
            {m?.deprecated && <Badge variant="destructive" className="text-[10px]">legacy</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{m?.label || key}</p>
          {m?.hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{m.hint}</p>}
          {m?.deprecationHint && (
            <p className="text-[11px] text-amber-400/80 mt-0.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {m.deprecationHint}
            </p>
          )}
          {showRelated && relatedItem && (
            <p className="text-[11px] text-cyan-400 mt-1 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              Paired with <code className="bg-muted px-1 rounded">{m.relatedKey}</code>
            </p>
          )}
          <div className="mt-1">
            {isSecret ? (
              <span className={`text-xs font-medium ${isSet ? "text-success" : "text-destructive"} flex items-center gap-1`}>
                {isSet ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {isSet ? "Configured" : "Not configured"}
              </span>
            ) : (
              <span className="text-xs font-mono bg-muted/40 px-2 py-0.5 rounded">
                {value || "(empty)"}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => startEdit(key, value)}>
          Edit
        </Button>
      </div>
    );
  };

  const renderGroup = (groupName: string, keys: string[], category: string, isLegacyGroup: boolean = false) => {
    const filteredKeys = keys.filter(key => {
      const s = settingMap.get(key);
      const m = meta[key];
      const value = s?.value || "";
      const isSet = s?.isSet ?? Boolean(value);

      const matchesSearch = searchTerm === "" ||
        key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m?.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m?.hint?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesShowEmpty = showEmptyFields || isSet;

      return matchesSearch && matchesShowEmpty;
    });

    if (filteredKeys.length === 0) return null;

    return (
      <div key={groupName} className="space-y-1">
        {groupName !== "General" && !isLegacyGroup && (
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 rounded-t-lg">
            {groupName}
          </div>
        )}
        <Card className={`overflow-hidden ${isLegacyGroup ? "border-amber-500/20 bg-amber-500/5" : ""}`}>
          <div className="divide-y divide-border/50">
            {filteredKeys.map((key) => renderField(key, category, isLegacyGroup))}
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">⚙️ Platform Runtime Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          <strong>AI Configuration</strong> applies globally to all organizations, projects, KBs and assistants.
          Organizations can only override Identity, Behaviour, Language & Voice settings.
          Payment & Phone changes take effect without restarting the application. Secret values are masked.
        </p>
      </div>
      {success && (
        <div className="rounded-lg bg-success/10 border border-success/30 px-4 py-2 text-sm text-success flex items-center gap-2">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}
      {error && !editing && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <Tabs value={filterCategory} onValueChange={(val) => setFilterCategory(val as typeof CATEGORIES[number] | "all")} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {CATEGORIES.map(cat => (
            <TabsTrigger key={cat} value={cat} className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">{CATEGORY_LABELS[cat].icon}</span>
                <span className="font-medium">{CATEGORY_LABELS[cat].title}</span>
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <Input
            type="text"
            placeholder="Search configurations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64"
          />
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label htmlFor="show-empty" className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                    Show Empty Fields
                  </Label>
                </TooltipTrigger>
                <TooltipContent>
                  Toggle to show/hide fields that are not configured.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch
              id="show-empty"
              checked={showEmptyFields}
              onCheckedChange={setShowEmptyFields}
            />
          </div>
        </div>

        {CATEGORIES.map(cat => (
          <TabsContent key={cat} value={cat} className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">{CATEGORY_LABELS[cat].description}</p>

            {(() => {
              const keys = CATEGORY_KEYS[cat] || [];
              // Group keys by metadata.group
              const grouped = keys.reduce<Record<string, string[]>>((acc, key) => {
                const g = meta[key]?.group || "General";
                (acc[g] ??= []).push(key);
                return acc;
              }, {});

              // Separate legacy groups
              const legacyGroups: Record<string, string[]> = {};
              const normalGroups: Record<string, string[]> = {};
              Object.entries(grouped).forEach(([g, ks]) => {
                if (g.includes("(Legacy)")) {
                  legacyGroups[g] = ks;
                } else {
                  normalGroups[g] = ks;
                }
              });

              const renderedNormalGroups = Object.entries(normalGroups).map(([groupName, groupKeys]) =>
                renderGroup(groupName, groupKeys, cat, false)
              ).filter(Boolean); // Filter out nulls from groups with no matching fields

              const renderedLegacyGroups = Object.keys(legacyGroups).length > 0 && (
                <div className="border-t border-amber-500/20 pt-4">
                  <div className="flex items-center gap-2 text-xs text-amber-400 mb-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="font-medium">Legacy fields (kept for reference)</span>
                  </div>
                  {Object.entries(legacyGroups).map(([groupName, groupKeys]) =>
                    renderGroup(groupName, groupKeys, cat, true)
                  ).filter(Boolean)}
                </div>
              );

              if (renderedNormalGroups.length === 0 && !renderedLegacyGroups) {
                return (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No matching configurations found for this category.</p>
                    <p className="text-sm mt-1">Try adjusting your search or filters.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {renderedNormalGroups}
                  {renderedLegacyGroups}
                </div>
              );
            })()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
