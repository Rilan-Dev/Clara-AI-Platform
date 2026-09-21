"use client";

/**
 * src/components/admin/PlatformEnvPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform settings — API keys, default models and integrations, restyled with
 * the shared settings design language (settings-ui.tsx), the same UX as the
 * "AI Providers & Models" editor: provider cards, friendly dropdowns with
 * pricing metadata, switches for flags, one Save bar per category.
 *
 * Behavioural notes:
 *   • Everything is edited in a draft; only keys whose value actually changed
 *     are sent on Save (secrets are only sent when something was typed, or
 *     when explicitly cleared).
 *   • The original security protocol is preserved end-to-end: each saved key
 *     still goes through GET /api/platform/env?token=1 → HMAC confirmation
 *     token → POST. The per-row "I confirm" checkbox is consolidated into a
 *     single confirmation on the Save bar.
 *   • Secrets never echo back — set secrets render as "Set up" with a blank
 *     input; typing replaces, Clear unsets.
 *   • Model dropdowns draw from the canonical catalogues via
 *     ai-settings-options.ts; WS-0.4 chat/embedding cross-entry validation
 *     runs client-side on save and server-side on write.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, CreditCard, Smartphone, Globe, Sparkles, KeyRound, Volume2, AudioLines, SlidersHorizontal, Phone, Building2, Waves, Gauge, Languages } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { validateModelField } from "@/modules/ai-core/model-catalog";
import {
  SettingsSection, OptionCardGrid, ModelSelect, TextField, FeatureToggle, SecretField, SaveBar, StatusPills,
} from "@/components/admin/settings-ui";
import {
  BRAIN_PROVIDERS,
  openaiChatOptions, geminiChatOptions, sarvamChatOptions,
  openaiEmbeddingOptions, geminiEmbeddingOptions,
  realtimeOptions, transcriptionOptions, voiceOptions,
  elevenlabsTtsOptions, elevenlabsSttOptions,
  sarvamTtsOptions, sarvamSttOptions, sarvamSpeakerOptions,
} from "@/components/admin/ai-settings-options";

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

// ─── Field metadata (labels, hints, helper links, validation) ────────────────

interface FieldMeta {
  label: string;
  hint?: string;
  validation?: (value: string) => string | null;
  isSecret?: boolean;
  helperLink?: { label: string; href: string };
  deprecated?: boolean;
}

/** WS-0.4: shared validator for the model fields — a chat model in the
 *  embedding field (or vice versa) is blocked at entry. */
const modelFieldValidation =
  (field: "chat" | "embedding", provider: "openai" | "gemini") =>
  (v: string): string | null => {
    const result = validateModelField({ field, model: v, provider });
    return result.ok ? null : result.message;
  };

const FIELD_METADATA: Record<string, FieldMeta> = {
  // ── AI ─────────────────────────────────────────────────────────────
  OPENAI_API_KEY: {
    label: "OpenAI API key",
    hint: "Your secret password for OpenAI. Copy it from platform.openai.com → API keys.",
    isSecret: true,
    helperLink: { label: "OpenAI Dashboard →", href: "https://platform.openai.com/api-keys" },
  },
  OPENAI_CHAT_MODEL: {
    label: "Chat model", hint: "Powers every assistant reply on OpenAI.",
    validation: modelFieldValidation("chat", "openai"),
  },
  OPENAI_EMBEDDING_MODEL: {
    label: "Embedding model", hint: "Turns documents into searchable vectors. Must match the vector dimension.",
    validation: modelFieldValidation("embedding", "openai"),
  },
  OPENAI_REALTIME_MODEL: { label: "Realtime model", hint: "Live voice sessions (OpenAI Realtime)." },
  OPENAI_TRANSCRIPTION_MODEL: { label: "Transcription model", hint: "Speech-to-text inside realtime sessions." },
  OPENAI_DEFAULT_VOICE: { label: "Default voice", hint: "Voice for spoken answers on OpenAI." },
  GEMINI_API_KEY: {
    label: "Gemini API key",
    hint: "Your secret password for Google Gemini. Copy it from aistudio.google.com → Get API key.",
    isSecret: true,
    helperLink: { label: "Google AI Studio →", href: "https://aistudio.google.com/apikey" },
  },
  GEMINI_CHAT_MODEL: {
    label: "Chat model", hint: "Powers every assistant reply on Gemini.",
    validation: modelFieldValidation("chat", "gemini"),
  },
  GEMINI_EMBEDDING_MODEL: {
    label: "Embedding model", hint: "Turns documents into searchable vectors. Must match the vector dimension.",
    validation: modelFieldValidation("embedding", "gemini"),
  },
  GEMINI_REALTIME_MODEL: { label: "Realtime model", hint: "Live voice sessions (Gemini Live API)." },
  GEMINI_TRANSCRIPTION_MODEL: { label: "Transcription model", hint: "Speech-to-text for Gemini voice." },
  GEMINI_DEFAULT_VOICE: { label: "Default voice", hint: "Voice for spoken answers on Gemini." },
  ELEVENLABS_API_KEY: {
    label: "ElevenLabs API key",
    hint: "Used ONLY for voice (speaking & listening) — documents and knowledge bases never leave Clara.",
    isSecret: true,
    helperLink: { label: "ElevenLabs Dashboard →", href: "https://elevenlabs.io/app/settings/api-keys" },
  },
  ELEVENLABS_DEFAULT_VOICE_ID: {
    label: "Default voice ID",
    hint: "Platform-fallback voice, e.g. JBFqnCBsd6RMkjVDRZzb. Organisations pick their own voices in their AI settings.",
  },
  ELEVENLABS_SPEECH_ENGINE_ENABLED: {
    label: "Enable Speech Engine",
    hint: "Use ElevenLabs Speech Engine for realtime voice. ElevenLabs handles STT, turn-taking and TTS while Clara supplies the LLM/RAG response stream.",
  },
  ELEVENLABS_SPEECH_ENGINE_ID: {
    label: "Speech Engine ID",
    hint: "ElevenLabs Speech Engine resource ID (seng_...). The resource must point to the Clara Speech Engine WebSocket endpoint.",
  },
  ELEVENLABS_TOOL_HMAC_SECRET: {
    label: "Mode-B tool secret",
    hint: "HMAC secret for the signed RAG server-tool callback. Required before any Mode-B agent can be created. Generate with: openssl rand -hex 32",
    isSecret: true,
    helperLink: { label: "Setup guide →", href: "https://github.com/Rilan-Dev/Clara-AI-Platform/blob/Vite-Converted/Doc/MODE_B_AND_WEBHOOK_SECRETS_SETUP.md" },
  },
  ELEVENLABS_WEBHOOK_SECRET: {
    label: "Post-call webhook secret",
    hint: "Signing secret for ElevenLabs post-call webhooks. Register the URL in the ElevenLabs dashboard.",
    isSecret: true,
    helperLink: { label: "Setup guide →", href: "https://github.com/Rilan-Dev/Clara-AI-Platform/blob/Vite-Converted/Doc/MODE_B_AND_WEBHOOK_SECRETS_SETUP.md" },
  },
  ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT: {
    label: "Credit alert threshold (%)",
    hint: "Email super admins when this percent of the monthly ElevenLabs character budget is consumed.",
    validation: (v) => { const n = parseInt(v, 10); return (n > 0 && n <= 100) ? null : "Must be 1–100"; },
  },
  AI_MAX_CHAT_TOKENS: {
    label: "Max chat tokens",
    hint: "The longest reply your assistant can write. Blank = no platform cap.",
    validation: (v) => /^\d+$/.test(v) ? null : "Must be a positive integer",
  },
  AI_MAX_REALTIME_TOKENS: {
    label: "Max realtime tokens",
    hint: "The same cap for spoken (voice) conversations. Blank = no platform cap.",
    validation: (v) => /^\d+$/.test(v) ? null : "Must be a positive integer",
  },
  AI_MAX_TEMPERATURE: {
    label: "Max temperature",
    hint: "How creative replies may get (0 = always the same, 2 = very creative).",
    validation: (v) => { const n = parseFloat(v); return (n >= 0 && n <= 2) ? null : "Must be between 0 and 2"; },
  },

  // ── Sarvam (Indic brain + voice + language services) ──────────────
  SARVAM_ENABLED: {
    label: "Enable Sarvam",
    hint: "Master switch for the Sarvam provider (brain, voice and language services). The API key must also be set.",
  },
  SARVAM_API_KEY: {
    label: "Sarvam API key",
    hint: "API subscription key from dashboard.sarvam.ai — sent as the api-subscription-key header.",
    isSecret: true,
    helperLink: { label: "Sarvam API Keys →", href: "https://dashboard.sarvam.ai/settings/api-keys" },
  },
  SARVAM_BASE_URL: {
    label: "Sarvam API base URL",
    hint: "Override only for self-hosted endpoints. Default: https://api.sarvam.ai",
  },
  SARVAM_TIMEOUT_MS: {
    label: "Sarvam timeout (ms)",
    hint: "Vendor timeout — STT uses 90 s headroom, chat 60 s.",
  },
  SARVAM_CHAT_MODEL: {
    label: "Default chat model",
    hint: "Starting brain model for organisations on Sarvam (sarvam-105b recommended).",
  },
  SARVAM_BETA_MODELS_ENABLED: {
    label: "Beta open-source models",
    hint: "Expose gemma4 / deepseekv4-flash / glm5.3 (hosted on the /v2 beta endpoint) in pickers.",
  },
  SARVAM_TTS_MODEL: {
    label: "Default TTS model",
    hint: "Bulbul model used for spoken replies (bulbul:v3 recommended).",
  },
  SARVAM_STT_MODEL: {
    label: "Default STT model",
    hint: "Saaras model used for understanding speech (saaras:v3 default).",
  },
  SARVAM_DEFAULT_SPEAKER: {
    label: "Default Bulbul speaker",
    hint: "Voice used when an organisation has not picked one (shubh default).",
  },
  SARVAM_EMBEDDING_FALLBACK_PROVIDER: {
    label: "Embedding backbone",
    hint: "Sarvam publishes no embeddings API — embeddings run on this provider (openai | gemini).",
  },
  SARVAM_TRANSLATION_ENABLED: {
    label: "Language services",
    hint: "Kill switch for translation / transliteration / language identification (cross-lingual RAG).",
  },
  SARVAM_TRANSLATE_MODEL: {
    label: "Default translation model",
    hint: "sarvam-translate:v1 (22 languages) or mayura:v1 (11 languages).",
  },
  SARVAM_INR_TO_USD: {
    label: "INR → USD rate",
    hint: "FX rate for cost dashboards (Sarvam bills in rupees). Default 0.012.",
    validation: (v) => { const n = parseFloat(v); return (n > 0 && n < 1) ? null : "Must be between 0 and 1"; },
  },
  SARVAM_REALTIME_STT_ENABLED: {
    label: "Realtime STT relay",
    hint: "Enable the low-latency Saaras realtime WebSocket transport for browser and phone voice sessions.",
  },
  SARVAM_REALTIME_STT_MODEL: {
    label: "Realtime STT model",
    hint: "Exact Sarvam realtime WebSocket model. Default: saaras:v3-realtime; alternative: saaras:v4.",
  },
  SARVAM_REALTIME_LLM_MODEL: {
    label: "Realtime voice-agent LLM",
    hint: "Dialogue model for realtime phone sessions. Default: sarvam-105b-conversations.",
  },
  SARVAM_REALTIME_TTS_ENABLED: {
    label: "Realtime streaming TTS",
    hint: "Enable Bulbul v3 WebSocket streaming for low-latency spoken responses.",
  },

  // ── Payments ──────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: {
    label: "Stripe secret key",
    hint: "Server-side secret key from the Stripe Dashboard (USD payments).",
    isSecret: true,
    helperLink: { label: "Stripe API Keys →", href: "https://dashboard.stripe.com/apikeys" },
  },
  STRIPE_WEBHOOK_SECRET: {
    label: "Stripe webhook secret",
    hint: "Signing secret from your Stripe webhook endpoint.",
    isSecret: true,
    helperLink: { label: "Stripe Webhooks →", href: "https://dashboard.stripe.com/webhooks" },
  },
  STRIPE_PRICE_STARTER: {
    label: "Starter plan price ID", hint: "Managed on the Subscriptions page — kept for reference only.",
    deprecated: true,
  },
  STRIPE_PRICE_PRO: {
    label: "Pro plan price ID", hint: "Managed on the Subscriptions page — kept for reference only.",
    deprecated: true,
  },
  RAZORPAY_KEY_ID: {
    label: "Razorpay Key ID (server)",
    hint: "Server-side Key ID from the Razorpay Dashboard (INR payments).",
    helperLink: { label: "Razorpay API Keys →", href: "https://dashboard.razorpay.com/app/keys" },
  },
  NEXT_PUBLIC_RAZORPAY_KEY_ID: {
    label: "Razorpay Key ID (public)",
    hint: "Browser-safe Key ID passed to Razorpay Checkout.js — usually identical to the server Key ID.",
  },
  RAZORPAY_KEY_SECRET: {
    label: "Razorpay Key secret",
    hint: "Server-side secret (never exposed to the browser).",
    isSecret: true,
  },
  RAZORPAY_WEBHOOK_SECRET: {
    label: "Razorpay webhook secret",
    hint: "From Razorpay → Settings → Webhooks → Secret.",
    isSecret: true,
    helperLink: { label: "Razorpay Webhooks →", href: "https://dashboard.razorpay.com/app/webhooks" },
  },

  // ── Phone ──────────────────────────────────────────────────────────
  TWILIO_ACCOUNT_SID: { label: "Twilio Account SID", hint: "From the Twilio Console." },
  TWILIO_AUTH_TOKEN: { label: "Twilio auth token", hint: "From the Twilio Console.", isSecret: true },
  TWILIO_PHONE_NUMBER: { label: "Twilio phone number", hint: "E.164 format, e.g. +15551234567." },
  VONAGE_API_KEY: { label: "Vonage API key", hint: "From the Vonage Dashboard." },
  VONAGE_API_SECRET: { label: "Vonage API secret", hint: "From the Vonage Dashboard.", isSecret: true },
  VONAGE_PHONE_NUMBER: { label: "Vonage phone number", hint: "E.164 format, e.g. +15551234567." },

  // ── Platform ───────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: {
    label: "Public app URL",
    hint: "Base URL for payment callbacks, redirects and webhook endpoints.",
  },
  NEXT_PUBLIC_LANDING_EMBED_API_KEY: {
    label: "Landing embed API key",
    hint: "Public key used by the chat widget on your landing page.",
  },
};

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = ["ai", "payments", "phone", "platform"] as const;
type Category = (typeof CATEGORIES)[number];

/** Noun used in the per-tab Save button ("Save AI settings"). */
const CATEGORY_SAVE_NOUN: Record<Category, string> = {
  ai: "AI",
  payments: "payments",
  phone: "phone",
  platform: "website & app",
};

const CATEGORY_LABELS: Record<Category, { icon: React.ReactNode; short: string; title: string; description: string }> = {
  ai: {
    icon: <Bot className="w-4 h-4" />, short: "AI", title: "AI Providers & Models",
    description: "Platform-wide defaults: which AI company powers thinking (OpenAI or Google Gemini), the keys that connect them, the default models, and the ElevenLabs voice service. Organisations can pick their own provider and models — these are the defaults everything starts from.",
  },
  payments: {
    icon: <CreditCard className="w-4 h-4" />, short: "Payments", title: "Payments",
    description: "Connect Stripe (for USD) or Razorpay (for INR) so customers can pay online. The plan prices themselves are set on the Subscriptions page — here you only connect the accounts.",
  },
  phone: {
    icon: <Smartphone className="w-4 h-4" />, short: "Phone calls", title: "Phone calls",
    description: "Connect Twilio or Vonage if you want your assistant to make real voice phone calls. Pick the provider you have an account with, then fill in its details.",
  },
  platform: {
    icon: <Globe className="w-4 h-4" />, short: "Website & app", title: "Website & app",
    description: "Your public website address and the key used by the chat widget on your landing page.",
  },
};

const CATEGORY_KEYS: Record<Category, string[]> = {
  // NOTE (AI configuration migration): provider CREDENTIALS and default
  // provider/model selections moved to Settings → AI Platform → Providers &
  // Models (platform_ai_providers registry + platform_ai_defaults). This panel
  // keeps only the operational AI runtime flags — editing the same key in two
  // surfaces is the "duplicated provider information" anti-pattern the
  // migration removes.
  ai: [
    "ELEVENLABS_ENABLED", "ELEVENLABS_SPEECH_ENGINE_ENABLED", "ELEVENLABS_SPEECH_ENGINE_ID",
    "ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "ELEVENLABS_VOICE_CLONING_ENABLED", "ELEVENLABS_VOICE_DESIGN_ENABLED",
    "ELEVENLABS_TOOL_HMAC_SECRET", "ELEVENLABS_WEBHOOK_SECRET", "ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT",
    "SARVAM_ENABLED", "SARVAM_TIMEOUT_MS",
    "SARVAM_BETA_MODELS_ENABLED",
    "SARVAM_EMBEDDING_FALLBACK_PROVIDER", "SARVAM_TRANSLATION_ENABLED", "SARVAM_TRANSLATE_MODEL",
    "SARVAM_INR_TO_USD", "SARVAM_REALTIME_STT_ENABLED", "SARVAM_REALTIME_STT_MODEL", "SARVAM_REALTIME_LLM_MODEL", "SARVAM_REALTIME_TTS_ENABLED",
    "AI_MAX_CHAT_TOKENS", "AI_MAX_REALTIME_TOKENS", "AI_MAX_TEMPERATURE",
  ],
  payments: [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "RAZORPAY_KEY_ID", "NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
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

const PHONE_PROVIDERS = [
  { id: "twilio", label: "Twilio", blurb: "Voice calls over the Twilio programmable-voice network." },
  { id: "vonage", label: "Vonage", blurb: "Voice calls over the Vonage voice API." },
];

/** Field-metadata lookup, hoisted so callbacks close over a stable reference. */
const meta = (key: string): FieldMeta | undefined => FIELD_METADATA[key];

// ─── Panel ────────────────────────────────────────────────────────────────────

export function PlatformEnvPanel() {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Category>("ai");

  // Draft state — only the keys the user has touched.
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Secrets marked for explicit clearing (blank + Clear button).
  const [cleared, setCleared] = useState<Record<string, true>>({});

  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/platform/env"), { headers: withAuthHeaders() });
      const data = (await res.json()) as { settings?: EnvSetting[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
      setSettings(data.settings ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const settingMap = useMemo(() => new Map(settings.map((s) => [s.key, s])), [settings]);

  // ── Draft helpers ───────────────────────────────────────────────────────
  const isSecretKey = useCallback(
    (key: string) => settingMap.get(key)?.isSecret ?? FIELD_METADATA[key]?.isSecret ?? false,
    [settingMap],
  );
  /** Editable saved value — secrets always start blank (never echoed). */
  const savedValue = useCallback(
    (key: string) => {
      const s = settingMap.get(key);
      if (!s) return "";
      return s.isSecret ? "" : s.value || "";
    },
    [settingMap],
  );
  const isSet = useCallback(
    (key: string) => settingMap.get(key)?.isSet ?? false,
    [settingMap],
  );
  const display = useCallback(
    (key: string) => (key in draft ? draft[key] : savedValue(key)),
    [draft, savedValue],
  );
  const setDraftValue = useCallback((key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setCleared((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);
  const clearSecret = useCallback((key: string) => {
    setDraft((current) => ({ ...current, [key]: "" }));
    setCleared((current) => ({ ...current, [key]: true }));
  }, []);
  const isDirty = useCallback(
    (key: string) => {
      if (cleared[key]) return true;
      if (!(key in draft)) return false;
      if (isSecretKey(key)) return draft[key] !== "";
      return draft[key] !== savedValue(key);
    },
    [cleared, draft, isSecretKey, savedValue],
  );

  const dirtyKeysFor = useCallback(
    (keys: string[]) => keys.filter((k) => isDirty(k)),
    [isDirty],
  );

  const resetTab = useCallback((keys: string[]) => {
    setDraft((current) => {
      const next = { ...current };
      for (const k of keys) delete next[k];
      return next;
    });
    setCleared((current) => {
      const next = { ...current };
      for (const k of keys) delete next[k];
      return next;
    });
    setConfirm(false);
    setError(null);
  }, []);

  // ── Save (per changed key, HMAC confirmation-token flow preserved) ──────
  const saveTab = useCallback(
    async (category: Category) => {
      const keys = dirtyKeysFor(CATEGORY_KEYS[category]);
      if (keys.length === 0) return;

      // Client-side validation — WS-0.4 model cross-entry and numeric ranges.
      for (const key of keys) {
        const value = display(key);
        const validation = meta(key)?.validation;
        if (value.trim() && validation) {
          const message = validation(value);
          if (message) {
            setError(`${meta(key)?.label ?? key}: ${message}`);
            return;
          }
        }
      }

      setSaving(true);
      setError(null);
      const savedNow: string[] = [];
      const failures: { key: string; message: string }[] = [];

      for (const key of keys) {
        const value = display(key);
        try {
          const tokenRes = await fetch(
            apiUrl(`/api/platform/env?token=1&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`),
            { headers: withAuthHeaders() },
          );
          const tokenData = (await tokenRes.json()) as { confirmation_token?: string; timestamp?: number; error?: string };
          if (!tokenRes.ok || !tokenData.confirmation_token) {
            throw new Error(tokenData.error ?? "Could not create confirmation token");
          }
          const res = await fetch(apiUrl("/api/platform/env"), {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              key,
              value,
              confirmation_token: tokenData.confirmation_token,
              timestamp: tokenData.timestamp,
            }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok) throw new Error(data.error ?? `Failed to save ${key}`);
          savedNow.push(key);
        } catch (e) {
          failures.push({ key, message: (e as Error).message });
        }
      }

      // Drop successfully saved keys from the draft; keep failures for retry.
      if (savedNow.length > 0) {
        setDraft((current) => {
          const next = { ...current };
          for (const k of savedNow) delete next[k];
          return next;
        });
        setCleared((current) => {
          const next = { ...current };
          for (const k of savedNow) delete next[k];
          return next;
        });
      }

      setSaving(false);

      if (failures.length > 0) {
        const detail = failures
          .map((f) => `${meta(f.key)?.label ?? f.key}: ${f.message}`)
          .join(" · ");
        setError(detail);
        toast.error("Some settings could not be saved", { description: detail });
        return;
      }

      setSavedCount(savedNow.length);
      window.setTimeout(() => setSavedCount(0), 2500);
      setConfirm(false);
      toast.success("Platform settings saved", {
        description: `${savedNow.length} ${savedNow.length === 1 ? "change" : "changes"} applied — they take effect on the next request.`,
      });
      await load();
    },
    [dirtyKeysFor, display, load],
  );

  if (loading) return <div className="animate-pulse h-32 rounded-xl bg-muted/30" />;

  const activeDirty = dirtyKeysFor(CATEGORY_KEYS[tab]);

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(value) => { setTab(value as Category); setError(null); setConfirm(false); }} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1">
          {CATEGORIES.map((cat) => {
            const catDirty = dirtyKeysFor(CATEGORY_KEYS[cat]);
            return (
              <TabsTrigger key={cat} value={cat} className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-3 py-2">
                <div className="flex items-center gap-2">
                  {CATEGORY_LABELS[cat].icon}
                  <span className="font-medium text-xs sm:text-sm">{CATEGORY_LABELS[cat].short}</span>
                  {catDirty.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5">{catDirty.length}</Badge>
                  )}
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat} value={cat} className="space-y-6 pt-4">
            <Card className="border-border shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="text-primary">{CATEGORY_LABELS[cat].icon}</span>
                  {CATEGORY_LABELS[cat].title}
                </CardTitle>
                <CardDescription>
                  {CATEGORY_LABELS[cat].description}
                  {" "}Changes take effect on the next request — no redeploy needed. Secrets are hidden after saving, which keeps them safe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {cat === "ai" && (
                  <AICategoryEditor
                    display={display} setDraftValue={setDraftValue} isSet={isSet} clearSecret={clearSecret}
                  />
                )}
                {cat === "payments" && (
                  <PaymentsCategoryEditor
                    display={display} setDraftValue={setDraftValue} isSet={isSet} clearSecret={clearSecret}
                  />
                )}
                {cat === "phone" && (
                  <PhoneCategoryEditor
                    display={display} setDraftValue={setDraftValue} isSet={isSet} clearSecret={clearSecret}
                  />
                )}
                {cat === "platform" && (
                  <PlatformCategoryEditor display={display} setDraftValue={setDraftValue} />
                )}

                <SaveBar
                  error={error}
                  saving={saving}
                  onSave={() => void saveTab(cat)}
                  onReset={() => resetTab(CATEGORY_KEYS[cat])}
                  saveLabel={`Save ${CATEGORY_SAVE_NOUN[cat]} settings`}
                  confirm={confirm}
                  onConfirmChange={setConfirm}
                  confirmLabel="I confirm — these changes apply immediately to everyone using the platform"
                  dirty={activeDirty.length > 0}
                  extra={
                    savedCount > 0 ? (
                      <span className="text-success">{savedCount} {savedCount === 1 ? "change" : "changes"} saved.</span>
                    ) : activeDirty.length > 0 ? (
                      <span className="text-muted-foreground">
                        {activeDirty.length} unsaved {activeDirty.length === 1 ? "change" : "changes"} in this category.
                      </span>
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Category editors ─────────────────────────────────────────────────────────

type EditorProps = {
  display: (key: string) => string;
  setDraftValue: (key: string, value: string) => void;
  isSet?: (key: string) => boolean;
  clearSecret?: (key: string) => void;
};

function AICategoryEditor({ display, setDraftValue, isSet, clearSecret }: EditorProps) {
  const activeProvider =
    display("AI_PROVIDER") === "gemini" ? "gemini"
    : display("AI_PROVIDER") === "sarvam" ? "sarvam"
    : "openai";
  const elEnabled = display("ELEVENLABS_ENABLED") === "true";
  const svEnabled = display("SARVAM_ENABLED") === "true";
  const svTranslationEnabled = display("SARVAM_TRANSLATION_ENABLED") === "true";
  const svRealtimeEnabled = display("SARVAM_REALTIME_STT_ENABLED") === "true";
  const openaiKeySet = Boolean(isSet?.("OPENAI_API_KEY"));
  const geminiKeySet = Boolean(isSet?.("GEMINI_API_KEY"));
  const elKeySet = Boolean(isSet?.("ELEVENLABS_API_KEY"));
  const svKeySet = Boolean(isSet?.("SARVAM_API_KEY"));

  const boolToggle = (key: string, checked: boolean) => setDraftValue(key, checked ? "true" : "false");

  return (
    <>
      {/* ── Thinking provider ──────────────────────────────────────────── */}
      <SettingsSection
        icon={<Sparkles />}
        title="Thinking provider (chat & knowledge)"
        description="The default for every organisation on the platform. Organisations can still switch to the other provider in their own AI settings — both keys below should be filled in."
      >
        <OptionCardGrid
          options={BRAIN_PROVIDERS.map((p) => ({
            id: p.id,
            label: p.label,
            blurb: p.blurb,
            badge:
              p.id === "openai" && !openaiKeySet ? { text: "Key missing", variant: "destructive" as const }
              : p.id === "gemini" && !geminiKeySet ? { text: "Key missing", variant: "destructive" as const }
              : p.id === "sarvam" && !svKeySet ? { text: "Key missing", variant: "destructive" as const }
              : undefined,
          }))}
          value={activeProvider}
          onChange={(id) => {
            const next = id === "gemini" ? "gemini" : id === "sarvam" ? "sarvam" : "openai";
            if (next !== activeProvider) setDraftValue("AI_PROVIDER", next);
          }}
        />
      </SettingsSection>

      {/* ── API keys ───────────────────────────────────────────────────── */}
      <SettingsSection
        icon={<KeyRound />}
        title="API keys"
        description="Platform-wide secret keys. Blank means untouched — type to replace, Clear to remove."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SecretField
            label={FIELD_METADATA.OPENAI_API_KEY.label}
            hint={FIELD_METADATA.OPENAI_API_KEY.hint}
            helperLink={FIELD_METADATA.OPENAI_API_KEY.helperLink}
            value={display("OPENAI_API_KEY")}
            onChange={(value) => setDraftValue("OPENAI_API_KEY", value)}
            isSet={openaiKeySet}
            placeholder="sk-…"
            onClear={() => clearSecret?.("OPENAI_API_KEY")}
          />
          <SecretField
            label={FIELD_METADATA.GEMINI_API_KEY.label}
            hint={FIELD_METADATA.GEMINI_API_KEY.hint}
            helperLink={FIELD_METADATA.GEMINI_API_KEY.helperLink}
            value={display("GEMINI_API_KEY")}
            onChange={(value) => setDraftValue("GEMINI_API_KEY", value)}
            isSet={geminiKeySet}
            placeholder="AIza…"
            onClear={() => clearSecret?.("GEMINI_API_KEY")}
          />
          <SecretField
            label={FIELD_METADATA.SARVAM_API_KEY.label}
            hint={FIELD_METADATA.SARVAM_API_KEY.hint}
            helperLink={FIELD_METADATA.SARVAM_API_KEY.helperLink}
            value={display("SARVAM_API_KEY")}
            onChange={(value) => setDraftValue("SARVAM_API_KEY", value)}
            isSet={svKeySet}
            placeholder="API subscription key from dashboard.sarvam.ai"
            onClear={() => clearSecret?.("SARVAM_API_KEY")}
          />
        </div>
      </SettingsSection>

      {/* ── OpenAI defaults ────────────────────────────────────────────── */}
      <SettingsSection
        title="Default models — OpenAI"
        description="Starting models for organisations on OpenAI. Organisations and knowledge bases can override them."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ModelSelect
            label={FIELD_METADATA.OPENAI_CHAT_MODEL.label}
            hint={FIELD_METADATA.OPENAI_CHAT_MODEL.hint}
            value={display("OPENAI_CHAT_MODEL")}
            onChange={(value) => setDraftValue("OPENAI_CHAT_MODEL", value)}
            options={openaiChatOptions()}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.OPENAI_EMBEDDING_MODEL.label}
            hint={FIELD_METADATA.OPENAI_EMBEDDING_MODEL.hint}
            value={display("OPENAI_EMBEDDING_MODEL")}
            onChange={(value) => setDraftValue("OPENAI_EMBEDDING_MODEL", value)}
            options={openaiEmbeddingOptions()}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.OPENAI_REALTIME_MODEL.label}
            hint={FIELD_METADATA.OPENAI_REALTIME_MODEL.hint}
            value={display("OPENAI_REALTIME_MODEL")}
            onChange={(value) => setDraftValue("OPENAI_REALTIME_MODEL", value)}
            options={realtimeOptions("openai")}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.OPENAI_TRANSCRIPTION_MODEL.label}
            hint={FIELD_METADATA.OPENAI_TRANSCRIPTION_MODEL.hint}
            value={display("OPENAI_TRANSCRIPTION_MODEL")}
            onChange={(value) => setDraftValue("OPENAI_TRANSCRIPTION_MODEL", value)}
            options={transcriptionOptions("openai")}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.OPENAI_DEFAULT_VOICE.label}
            hint={FIELD_METADATA.OPENAI_DEFAULT_VOICE.hint}
            value={display("OPENAI_DEFAULT_VOICE")}
            onChange={(value) => setDraftValue("OPENAI_DEFAULT_VOICE", value)}
            options={voiceOptions("openai")}
            placeholder="Provider default"
          />
        </div>
      </SettingsSection>

      {/* ── Gemini defaults ────────────────────────────────────────────── */}
      <SettingsSection
        title="Default models — Gemini"
        description="Starting models for organisations on Gemini. Organisations and knowledge bases can override them."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ModelSelect
            label={FIELD_METADATA.GEMINI_CHAT_MODEL.label}
            hint={FIELD_METADATA.GEMINI_CHAT_MODEL.hint}
            value={display("GEMINI_CHAT_MODEL")}
            onChange={(value) => setDraftValue("GEMINI_CHAT_MODEL", value)}
            options={geminiChatOptions()}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.GEMINI_EMBEDDING_MODEL.label}
            hint={FIELD_METADATA.GEMINI_EMBEDDING_MODEL.hint}
            value={display("GEMINI_EMBEDDING_MODEL")}
            onChange={(value) => setDraftValue("GEMINI_EMBEDDING_MODEL", value)}
            options={geminiEmbeddingOptions()}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.GEMINI_REALTIME_MODEL.label}
            hint={FIELD_METADATA.GEMINI_REALTIME_MODEL.hint}
            value={display("GEMINI_REALTIME_MODEL")}
            onChange={(value) => setDraftValue("GEMINI_REALTIME_MODEL", value)}
            options={realtimeOptions("gemini")}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.GEMINI_TRANSCRIPTION_MODEL.label}
            hint={FIELD_METADATA.GEMINI_TRANSCRIPTION_MODEL.hint}
            value={display("GEMINI_TRANSCRIPTION_MODEL")}
            onChange={(value) => setDraftValue("GEMINI_TRANSCRIPTION_MODEL", value)}
            options={transcriptionOptions("gemini")}
            placeholder="Provider default"
          />
          <ModelSelect
            label={FIELD_METADATA.GEMINI_DEFAULT_VOICE.label}
            hint={FIELD_METADATA.GEMINI_DEFAULT_VOICE.hint}
            value={display("GEMINI_DEFAULT_VOICE")}
            onChange={(value) => setDraftValue("GEMINI_DEFAULT_VOICE", value)}
            options={voiceOptions("gemini")}
            placeholder="Provider default"
          />
        </div>
      </SettingsSection>

      {/* ── Sarvam defaults (brain) ─────────────────────────────────── */}
      <SettingsSection
        title="Default models — Sarvam"
        description="Starting models for organisations on Sarvam. Sarvam is chat-only: embeddings always run on the backbone below, so switching a brain to Sarvam never re-embeds a knowledge base."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ModelSelect
            label={FIELD_METADATA.SARVAM_CHAT_MODEL.label}
            hint={FIELD_METADATA.SARVAM_CHAT_MODEL.hint}
            value={display("SARVAM_CHAT_MODEL")}
            onChange={(value) => setDraftValue("SARVAM_CHAT_MODEL", value)}
            options={sarvamChatOptions()}
            placeholder="sarvam-105b"
          />
          <ModelSelect
            label={FIELD_METADATA.SARVAM_EMBEDDING_FALLBACK_PROVIDER.label}
            hint={FIELD_METADATA.SARVAM_EMBEDDING_FALLBACK_PROVIDER.hint}
            value={display("SARVAM_EMBEDDING_FALLBACK_PROVIDER")}
            onChange={(value) => setDraftValue("SARVAM_EMBEDDING_FALLBACK_PROVIDER", value)}
            options={[
              { value: "openai", label: "OpenAI embeddings", meta: "1536 / 3072 dims" },
              { value: "gemini", label: "Gemini embeddings", meta: "768 / 3072 dims" },
            ]}
            placeholder="openai"
          />
        </div>
      </SettingsSection>

      {/* ── Voice provider (Sarvam AI) + language services ───────────── */}
      <SettingsSection
        icon={<Volume2 />}
        title="Voice & language provider (Sarvam AI)"
        description="Sarvam is India's sovereign AI stack: Saaras speech-to-text (23 languages, 8 kHz telephony tuning), Bulbul text-to-speech (11 languages, 37 speakers) and translation services. Pipeline mode only — documents and knowledge bases never leave this platform."
      >
        <StatusPills
          items={[
            svKeySet ? { text: "Sarvam key set", tone: "ok" } : { text: "Sarvam key missing", tone: "bad" },
            svEnabled ? { text: "Enabled", tone: "ok" } : { text: "Disabled", tone: "neutral" },
            svTranslationEnabled ? { text: "Language services on", tone: "ok" } : { text: "Language services off", tone: "neutral" },
            svRealtimeEnabled ? { text: "Realtime STT relay on", tone: "ok" } : { text: "Realtime STT relay off", tone: "neutral" },
          ]}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <FeatureToggle
            icon={<Volume2 />}
            label="Enable Sarvam"
            description="Master switch for the Sarvam provider (brain + voice + language services). The API key must also be set."
            checked={svEnabled}
            onChange={(checked) => boolToggle("SARVAM_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<Languages />}
            label="Language services (cross-lingual RAG)"
            description="Translation, transliteration and language identification. Organisations then choose their translation mode (off / query / query+answer) in their AI settings."
            checked={svTranslationEnabled}
            onChange={(checked) => boolToggle("SARVAM_TRANSLATION_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<AudioLines />}
            label="Realtime STT relay"
            description="Stream partial transcripts for live captions and fire barge-in before the user stops speaking. Runs through the platform WebSocket relay — the Sarvam key never reaches the browser. Requires the custom server (npm run start) and a restart."
            checked={svRealtimeEnabled}
            onChange={(checked) => boolToggle("SARVAM_REALTIME_STT_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<Gauge />}
            label="Beta open-source models"
            description="Expose gemma4 / deepseekv4-flash / glm5.3 (hosted on the /v2 beta endpoint) in model pickers."
            checked={display("SARVAM_BETA_MODELS_ENABLED") === "true"}
            onChange={(checked) => boolToggle("SARVAM_BETA_MODELS_ENABLED", checked)}
          />
        </div>

        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
          <div className="flex items-center gap-2">
            <AudioLines className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Sarvam voice settings</h4>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelSelect
              label={FIELD_METADATA.SARVAM_TTS_MODEL.label}
              hint={FIELD_METADATA.SARVAM_TTS_MODEL.hint}
              value={display("SARVAM_TTS_MODEL")}
              onChange={(value) => setDraftValue("SARVAM_TTS_MODEL", value)}
              options={sarvamTtsOptions()}
              placeholder="bulbul:v3"
            />
            <ModelSelect
              label={FIELD_METADATA.SARVAM_STT_MODEL.label}
              hint={FIELD_METADATA.SARVAM_STT_MODEL.hint}
              value={display("SARVAM_STT_MODEL")}
              onChange={(value) => setDraftValue("SARVAM_STT_MODEL", value)}
              options={sarvamSttOptions()}
              placeholder="saaras:v3"
            />
            <ModelSelect
              label={FIELD_METADATA.SARVAM_DEFAULT_SPEAKER.label}
              hint={FIELD_METADATA.SARVAM_DEFAULT_SPEAKER.hint}
              value={display("SARVAM_DEFAULT_SPEAKER")}
              onChange={(value) => setDraftValue("SARVAM_DEFAULT_SPEAKER", value)}
              options={sarvamSpeakerOptions()}
              placeholder="shubh"
            />
            <ModelSelect
              label={FIELD_METADATA.SARVAM_TRANSLATE_MODEL.label}
              hint={FIELD_METADATA.SARVAM_TRANSLATE_MODEL.hint}
              value={display("SARVAM_TRANSLATE_MODEL")}
              onChange={(value) => setDraftValue("SARVAM_TRANSLATE_MODEL", value)}
              options={[
                { value: "sarvam-translate:v1", label: "Sarvam Translate v1", meta: "22 languages" },
                { value: "mayura:v1", label: "Mayura v1", meta: "11 languages" },
              ]}
              placeholder="sarvam-translate:v1"
            />
            <TextField
              label={FIELD_METADATA.SARVAM_BASE_URL.label}
              hint={FIELD_METADATA.SARVAM_BASE_URL.hint}
              value={display("SARVAM_BASE_URL")}
              onChange={(value) => setDraftValue("SARVAM_BASE_URL", value)}
              placeholder="https://api.sarvam.ai"
              mono
            />
            <TextField
              label={FIELD_METADATA.SARVAM_INR_TO_USD.label}
              hint={FIELD_METADATA.SARVAM_INR_TO_USD.hint}
              value={display("SARVAM_INR_TO_USD")}
              onChange={(value) => setDraftValue("SARVAM_INR_TO_USD", value)}
              placeholder="0.012"
              inputMode="decimal"
            />
          </div>
        </div>
      </SettingsSection>

      {/* ── Voice provider (ElevenLabs) ────────────────────────────────── */}
      <SettingsSection
        icon={<Volume2 />}
        title="Voice provider (ElevenLabs)"
        description="ElevenLabs is a voice-only provider — it speaks and listens, while Clara's own AI answers. Documents and knowledge bases never leave this platform."
      >
        <StatusPills
          items={[
            elKeySet ? { text: "ElevenLabs key set", tone: "ok" } : { text: "ElevenLabs key missing", tone: "bad" },
            elEnabled ? { text: "Enabled", tone: "ok" } : { text: "Disabled", tone: "neutral" },
          ]}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <FeatureToggle
            icon={<Volume2 />}
            label="Enable ElevenLabs"
            description="Master switch for the ElevenLabs voice provider. The API key must also be set."
            checked={elEnabled}
            onChange={(checked) => boolToggle("ELEVENLABS_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<AudioLines />}
            label="Conversational AI (Mode B)"
            description="Opt-in realtime ElevenLabs agents. Adds wss://api.elevenlabs.io to the browser CSP — requires a server restart after changing."
            checked={display("ELEVENLABS_CONVERSATIONAL_AI_ENABLED") === "true"}
            onChange={(checked) => boolToggle("ELEVENLABS_CONVERSATIONAL_AI_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<Waves />}
            label="Voice cloning"
            description="Instant voice cloning from reference audio. Every clone still requires a recorded consent attestation."
            checked={display("ELEVENLABS_VOICE_CLONING_ENABLED") === "true"}
            onChange={(checked) => boolToggle("ELEVENLABS_VOICE_CLONING_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<Gauge />}
            label="Voice design"
            description="Describe a voice in plain language; ElevenLabs generates it."
            checked={display("ELEVENLABS_VOICE_DESIGN_ENABLED") === "true"}
            onChange={(checked) => boolToggle("ELEVENLABS_VOICE_DESIGN_ENABLED", checked)}
          />
        </div>

        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
          <div className="flex items-center gap-2">
            <AudioLines className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">ElevenLabs settings</h4>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ModelSelect
              label="Default TTS model (speaking)"
              hint="Flash = lowest latency."
              value={display("ELEVENLABS_DEFAULT_TTS_MODEL")}
              onChange={(value) => setDraftValue("ELEVENLABS_DEFAULT_TTS_MODEL", value)}
              options={elevenlabsTtsOptions()}
              placeholder="Provider default"
            />
            <ModelSelect
              label="Default STT model (listening)"
              hint="Scribe transcribes spoken questions."
              value={display("ELEVENLABS_DEFAULT_STT_MODEL")}
              onChange={(value) => setDraftValue("ELEVENLABS_DEFAULT_STT_MODEL", value)}
              options={elevenlabsSttOptions()}
              placeholder="Provider default"
            />
            <SecretField
              label={FIELD_METADATA.ELEVENLABS_API_KEY.label}
              hint={FIELD_METADATA.ELEVENLABS_API_KEY.hint}
              helperLink={FIELD_METADATA.ELEVENLABS_API_KEY.helperLink}
              value={display("ELEVENLABS_API_KEY")}
              onChange={(value) => setDraftValue("ELEVENLABS_API_KEY", value)}
              isSet={elKeySet}
              placeholder="sk_…"
              onClear={() => clearSecret?.("ELEVENLABS_API_KEY")}
            />
            <TextField
              label={FIELD_METADATA.ELEVENLABS_DEFAULT_VOICE_ID.label}
              hint={FIELD_METADATA.ELEVENLABS_DEFAULT_VOICE_ID.hint}
              value={display("ELEVENLABS_DEFAULT_VOICE_ID")}
              onChange={(value) => setDraftValue("ELEVENLABS_DEFAULT_VOICE_ID", value)}
              placeholder="e.g. JBFqnCBsd6RMkjVDRZzb"
              mono
            />
            <SecretField
              label={FIELD_METADATA.ELEVENLABS_TOOL_HMAC_SECRET.label}
              hint={FIELD_METADATA.ELEVENLABS_TOOL_HMAC_SECRET.hint}
              value={display("ELEVENLABS_TOOL_HMAC_SECRET")}
              onChange={(value) => setDraftValue("ELEVENLABS_TOOL_HMAC_SECRET", value)}
              isSet={Boolean(isSet?.("ELEVENLABS_TOOL_HMAC_SECRET"))}
              placeholder="32+ random characters"
              onClear={() => clearSecret?.("ELEVENLABS_TOOL_HMAC_SECRET")}
            />
            <SecretField
              label={FIELD_METADATA.ELEVENLABS_WEBHOOK_SECRET.label}
              hint={FIELD_METADATA.ELEVENLABS_WEBHOOK_SECRET.hint}
              value={display("ELEVENLABS_WEBHOOK_SECRET")}
              onChange={(value) => setDraftValue("ELEVENLABS_WEBHOOK_SECRET", value)}
              isSet={Boolean(isSet?.("ELEVENLABS_WEBHOOK_SECRET"))}
              placeholder="From the ElevenLabs dashboard"
              onClear={() => clearSecret?.("ELEVENLABS_WEBHOOK_SECRET")}
            />
            <TextField
              label={FIELD_METADATA.ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT.label}
              hint={FIELD_METADATA.ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT.hint}
              value={display("ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT")}
              onChange={(value) => setDraftValue("ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT", value)}
              placeholder="80"
              inputMode="numeric"
            />
          </div>
        </div>
      </SettingsSection>

      {/* ── Limits ─────────────────────────────────────────────────────── */}
      <SettingsSection
        icon={<SlidersHorizontal />}
        title="Limits"
        description="Platform-wide ceilings. Organisations can only go lower, never higher. Blank = no platform cap."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <TextField
            label={FIELD_METADATA.AI_MAX_CHAT_TOKENS.label}
            hint={FIELD_METADATA.AI_MAX_CHAT_TOKENS.hint}
            value={display("AI_MAX_CHAT_TOKENS")}
            onChange={(value) => setDraftValue("AI_MAX_CHAT_TOKENS", value)}
            placeholder="No platform cap"
            inputMode="numeric"
          />
          <TextField
            label={FIELD_METADATA.AI_MAX_REALTIME_TOKENS.label}
            hint={FIELD_METADATA.AI_MAX_REALTIME_TOKENS.hint}
            value={display("AI_MAX_REALTIME_TOKENS")}
            onChange={(value) => setDraftValue("AI_MAX_REALTIME_TOKENS", value)}
            placeholder="No platform cap"
            inputMode="numeric"
          />
          <TextField
            label={FIELD_METADATA.AI_MAX_TEMPERATURE.label}
            hint={FIELD_METADATA.AI_MAX_TEMPERATURE.hint}
            value={display("AI_MAX_TEMPERATURE")}
            onChange={(value) => setDraftValue("AI_MAX_TEMPERATURE", value)}
            placeholder="No platform cap"
            inputMode="decimal"
          />
        </div>
      </SettingsSection>
    </>
  );
}

function PaymentsCategoryEditor({ display, setDraftValue, isSet, clearSecret }: EditorProps) {
  return (
    <>
      <SettingsSection
        title="Stripe (USD)"
        description="Connect Stripe so customers can subscribe and pay in US dollars."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SecretField
            label={FIELD_METADATA.STRIPE_SECRET_KEY.label}
            hint={FIELD_METADATA.STRIPE_SECRET_KEY.hint}
            helperLink={FIELD_METADATA.STRIPE_SECRET_KEY.helperLink}
            value={display("STRIPE_SECRET_KEY")}
            onChange={(value) => setDraftValue("STRIPE_SECRET_KEY", value)}
            isSet={Boolean(isSet?.("STRIPE_SECRET_KEY"))}
            placeholder="sk_test_… or sk_live_…"
            onClear={() => clearSecret?.("STRIPE_SECRET_KEY")}
          />
          <SecretField
            label={FIELD_METADATA.STRIPE_WEBHOOK_SECRET.label}
            hint={FIELD_METADATA.STRIPE_WEBHOOK_SECRET.hint}
            helperLink={FIELD_METADATA.STRIPE_WEBHOOK_SECRET.helperLink}
            value={display("STRIPE_WEBHOOK_SECRET")}
            onChange={(value) => setDraftValue("STRIPE_WEBHOOK_SECRET", value)}
            isSet={Boolean(isSet?.("STRIPE_WEBHOOK_SECRET"))}
            placeholder="whsec_…"
            onClear={() => clearSecret?.("STRIPE_WEBHOOK_SECRET")}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Razorpay (INR)"
        description="Connect Razorpay so customers can subscribe and pay in Indian rupees."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField
            label={FIELD_METADATA.RAZORPAY_KEY_ID.label}
            hint={FIELD_METADATA.RAZORPAY_KEY_ID.hint}
            helperLink={FIELD_METADATA.RAZORPAY_KEY_ID.helperLink}
            value={display("RAZORPAY_KEY_ID")}
            onChange={(value) => setDraftValue("RAZORPAY_KEY_ID", value)}
            placeholder="rzp_test_… or rzp_live_…"
            mono
          />
          <TextField
            label={FIELD_METADATA.NEXT_PUBLIC_RAZORPAY_KEY_ID.label}
            hint={FIELD_METADATA.NEXT_PUBLIC_RAZORPAY_KEY_ID.hint}
            value={display("NEXT_PUBLIC_RAZORPAY_KEY_ID")}
            onChange={(value) => setDraftValue("NEXT_PUBLIC_RAZORPAY_KEY_ID", value)}
            placeholder="Usually identical to the server Key ID"
            mono
          />
          <SecretField
            label={FIELD_METADATA.RAZORPAY_KEY_SECRET.label}
            hint={FIELD_METADATA.RAZORPAY_KEY_SECRET.hint}
            value={display("RAZORPAY_KEY_SECRET")}
            onChange={(value) => setDraftValue("RAZORPAY_KEY_SECRET", value)}
            isSet={Boolean(isSet?.("RAZORPAY_KEY_SECRET"))}
            onClear={() => clearSecret?.("RAZORPAY_KEY_SECRET")}
          />
          <SecretField
            label={FIELD_METADATA.RAZORPAY_WEBHOOK_SECRET.label}
            hint={FIELD_METADATA.RAZORPAY_WEBHOOK_SECRET.hint}
            helperLink={FIELD_METADATA.RAZORPAY_WEBHOOK_SECRET.helperLink}
            value={display("RAZORPAY_WEBHOOK_SECRET")}
            onChange={(value) => setDraftValue("RAZORPAY_WEBHOOK_SECRET", value)}
            isSet={Boolean(isSet?.("RAZORPAY_WEBHOOK_SECRET"))}
            onClear={() => clearSecret?.("RAZORPAY_WEBHOOK_SECRET")}
          />
        </div>
      </SettingsSection>

      {/* Legacy fields — kept for reference, managed elsewhere now. */}
      <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 opacity-90">
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-medium">Legacy fields (kept for reference)</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField
            label={FIELD_METADATA.STRIPE_PRICE_STARTER.label}
            hint={FIELD_METADATA.STRIPE_PRICE_STARTER.hint}
            value={display("STRIPE_PRICE_STARTER")}
            onChange={(value) => setDraftValue("STRIPE_PRICE_STARTER", value)}
            placeholder="price_…"
            mono
          />
          <TextField
            label={FIELD_METADATA.STRIPE_PRICE_PRO.label}
            hint={FIELD_METADATA.STRIPE_PRICE_PRO.hint}
            value={display("STRIPE_PRICE_PRO")}
            onChange={(value) => setDraftValue("STRIPE_PRICE_PRO", value)}
            placeholder="price_…"
            mono
          />
        </div>
      </div>
    </>
  );
}

function PhoneCategoryEditor({ display, setDraftValue, isSet, clearSecret }: EditorProps) {
  const active = display("PHONE_PROVIDER") === "vonage" ? "vonage" : "twilio";
  return (
    <>
      <SettingsSection
        icon={<Phone />}
        title="Phone provider"
        description="Which network carries your assistant's outbound voice calls."
      >
        <OptionCardGrid
          options={PHONE_PROVIDERS}
          value={active}
          onChange={(id) => {
            const next = id === "vonage" ? "vonage" : "twilio";
            if (next !== active) setDraftValue("PHONE_PROVIDER", next);
          }}
        />
      </SettingsSection>

      <SettingsSection
        icon={<Building2 />}
        title="Twilio"
        description="Credentials from your Twilio Console."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <TextField
            label={FIELD_METADATA.TWILIO_ACCOUNT_SID.label}
            hint={FIELD_METADATA.TWILIO_ACCOUNT_SID.hint}
            value={display("TWILIO_ACCOUNT_SID")}
            onChange={(value) => setDraftValue("TWILIO_ACCOUNT_SID", value)}
            placeholder="AC…"
            mono
          />
          <SecretField
            label={FIELD_METADATA.TWILIO_AUTH_TOKEN.label}
            hint={FIELD_METADATA.TWILIO_AUTH_TOKEN.hint}
            value={display("TWILIO_AUTH_TOKEN")}
            onChange={(value) => setDraftValue("TWILIO_AUTH_TOKEN", value)}
            isSet={Boolean(isSet?.("TWILIO_AUTH_TOKEN"))}
            onClear={() => clearSecret?.("TWILIO_AUTH_TOKEN")}
          />
          <TextField
            label={FIELD_METADATA.TWILIO_PHONE_NUMBER.label}
            hint={FIELD_METADATA.TWILIO_PHONE_NUMBER.hint}
            value={display("TWILIO_PHONE_NUMBER")}
            onChange={(value) => setDraftValue("TWILIO_PHONE_NUMBER", value)}
            placeholder="+15551234567"
            mono
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Building2 />}
        title="Vonage"
        description="Credentials from your Vonage Dashboard."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <TextField
            label={FIELD_METADATA.VONAGE_API_KEY.label}
            hint={FIELD_METADATA.VONAGE_API_KEY.hint}
            value={display("VONAGE_API_KEY")}
            onChange={(value) => setDraftValue("VONAGE_API_KEY", value)}
            mono
          />
          <SecretField
            label={FIELD_METADATA.VONAGE_API_SECRET.label}
            hint={FIELD_METADATA.VONAGE_API_SECRET.hint}
            value={display("VONAGE_API_SECRET")}
            onChange={(value) => setDraftValue("VONAGE_API_SECRET", value)}
            isSet={Boolean(isSet?.("VONAGE_API_SECRET"))}
            onClear={() => clearSecret?.("VONAGE_API_SECRET")}
          />
          <TextField
            label={FIELD_METADATA.VONAGE_PHONE_NUMBER.label}
            hint={FIELD_METADATA.VONAGE_PHONE_NUMBER.hint}
            value={display("VONAGE_PHONE_NUMBER")}
            onChange={(value) => setDraftValue("VONAGE_PHONE_NUMBER", value)}
            placeholder="+15551234567"
            mono
          />
        </div>
      </SettingsSection>
    </>
  );
}

function PlatformCategoryEditor({ display, setDraftValue }: EditorProps) {
  return (
    <SettingsSection
      icon={<Globe />}
      title="Website & app"
      description="Your public website address and the landing-page chat widget key."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <TextField
          label={FIELD_METADATA.NEXT_PUBLIC_APP_URL.label}
          hint={FIELD_METADATA.NEXT_PUBLIC_APP_URL.hint}
          value={display("NEXT_PUBLIC_APP_URL")}
          onChange={(value) => setDraftValue("NEXT_PUBLIC_APP_URL", value)}
          placeholder="https://your-domain.com"
          type="url"
        />
        <TextField
          label={FIELD_METADATA.NEXT_PUBLIC_LANDING_EMBED_API_KEY.label}
          hint={FIELD_METADATA.NEXT_PUBLIC_LANDING_EMBED_API_KEY.hint}
          value={display("NEXT_PUBLIC_LANDING_EMBED_API_KEY")}
          onChange={(value) => setDraftValue("NEXT_PUBLIC_LANDING_EMBED_API_KEY", value)}
          placeholder="clr_…"
          mono
        />
      </div>
    </SettingsSection>
  );
}
