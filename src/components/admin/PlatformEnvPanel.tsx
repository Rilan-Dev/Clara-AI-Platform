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
 *     still goes through POST /api/platform/env { action: "token" } → HMAC confirmation
 *     token → POST. The per-row "I confirm" checkbox is consolidated into a
 *     single confirmation on the Save bar.
 *   • Secrets never echo back — set secrets render as "Set up" with a blank
 *     input; typing replaces, Clear unsets.
 *   • Model dropdowns draw from the canonical catalogues via
 *     ai-settings-options.ts; WS-0.4 chat/embedding cross-entry validation
 *     runs client-side on save and server-side on write.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Smartphone, KeyRound, Volume2, AudioLines, SlidersHorizontal, Phone, Building2, Waves, Gauge, Languages } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { apiUrl } from "@/lib/runtime";
import { savePlatformEnvSetting } from "@/lib/platform-env-client";
import { withAuthHeaders } from "@/lib/client-auth";
import { validateModelField } from "@/modules/ai-core/model-catalog";
import {
  SettingsSection, OptionCardGrid, ModelSelect, TextField, FeatureToggle, SecretField, SaveBar, StatusPills,
} from "@/components/admin/settings-ui";
import {
  sarvamChatOptions, sarvamSpeakerOptions,
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
  ELEVENLABS_REALTIME_ENABLED: {
    label: "Enable ElevenLabs realtime voice",
    hint: "Platform-wide switch for Clara-controlled ElevenLabs realtime voice. Prefer the dedicated toggle in the ElevenLabs AI Platform half-canvas.",
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
    hint: "Caps each spoken (realtime voice) reply. Spoken audio counts against it, so a low value cuts answers off mid-sentence. Blank = no cap (recommended); the assistant's reply length setting applies to text chat.",
    validation: (v) => /^\d+$/.test(v) ? null : "Must be a positive integer",
  },
  AI_MAX_TEMPERATURE: {
    label: "Max temperature",
    hint: "How creative replies may get (0 = always the same, 2 = very creative).",
    validation: (v) => { const n = parseFloat(v); return (n >= 0 && n <= 2) ? null : "Must be between 0 and 2"; },
  },

  // ── Multilingual knowledge index (E5, ElevenLabs-grade RAG) ─────────
  MULTILINGUAL_EMBEDDINGS_ENABLED: {
    label: "Multilingual knowledge index",
    hint: "Offer the multilingual index (true/false) to organisations whose plan includes it.",
    validation: (v) => (v === "" || v === "true" || v === "false" ? null : "Use true or false"),
  },
  MULTILINGUAL_EMBEDDINGS_BASE_URL: {
    label: "Embeddings endpoint",
    hint: "Any OpenAI-compatible /v1/embeddings URL. VPS: http://qwen-embeddings:8080 (the local Qwen3-Embedding service in docker-compose). Vercel: a hosted endpoint serving a compatible model.",
    validation: (v) => (v === "" || /^https?:\/\//i.test(v) ? null : "Must start with http:// or https://"),
  },
  MULTILINGUAL_EMBEDDINGS_API_KEY: {
    label: "Embeddings API key",
    hint: "Bearer token for the endpoint. Leave empty for a private self-hosted server.",
    isSecret: true,
  },
  MULTILINGUAL_EMBEDDINGS_MODEL: {
    label: "Multilingual model",
    hint: "Qwen/Qwen3-Embedding-0.6B (1024-d, 100+ languages — the local qwen-embeddings service). Also: BAAI/bge-m3, or any OpenAI-compatible endpoint's model id.",
  },
  MULTILINGUAL_EMBEDDINGS_DIMENSION: {
    label: "Vector size (optional)",
    hint: "Only for a model the platform does not know. Known models set it automatically.",
    validation: (v) => (v === "" || /^\d+$/.test(v) ? null : "Must be a whole number"),
  },

  // ── Sarvam (Indic brain + voice + language services) ──────────────
  SARVAM_API_KEY: {
    label: "Sarvam API key",
    hint: "API subscription key from dashboard.sarvam.ai — sent as the api-subscription-key header.",
    isSecret: true,
    helperLink: { label: "Sarvam API Keys →", href: "https://dashboard.sarvam.ai/settings/api-keys" },
  },
  SARVAM_BASE_URL: {
    label: "Sarvam API base URL",
    hint: "Override only for a reachable self-hosted endpoint or proxy. Default: https://api.sarvam.ai. Never api.vendor.ai — that is a dead placeholder domain, not a Sarvam endpoint.",
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
    hint: "Sarvam publishes no embeddings API — embeddings run on this provider (openai | gemini | qwen).",
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
  SARVAM_REALTIME_STT_MODEL: {
    label: "Realtime STT model",
    hint: "Exact Sarvam realtime WebSocket model. Default: saaras:v3-realtime; alternative: saaras:v4-realtime.",
  },
  SARVAM_REALTIME_VAD_THRESHOLD: {
    label: "Speech detection threshold",
    hint: "Realtime VAD speech probability (0.05–0.95). Lower = more sensitive. Default 0.3.",
    validation: (v) => { const n = parseFloat(v); return v === "" || (n >= 0.05 && n <= 0.95) ? null : "Must be between 0.05 and 0.95"; },
  },
  SARVAM_REALTIME_SILENCE_MS: {
    label: "End-of-turn silence (ms)",
    hint: "Silence that ends the caller's turn (100–3000). Lower replies sooner; higher lets people pause. Default 500.",
    validation: (v) => { const n = Number(v); return v === "" || (Number.isInteger(n) && n >= 100 && n <= 3000) ? null : "Whole number 100–3000"; },
  },
  SARVAM_REALTIME_MIN_SPEECH_MS: {
    label: "Minimum speech (ms)",
    hint: "Shortest sound treated as speech (50–2000) — filters coughs and clicks. Default 250.",
    validation: (v) => { const n = Number(v); return v === "" || (Number.isInteger(n) && n >= 50 && n <= 2000) ? null : "Whole number 50–2000"; },
  },
  SARVAM_TTS_PACE: {
    label: "Speaking pace",
    hint: "Bulbul speaking pace for realtime voice and phone calls (0.5–2.0). Default 1.0.",
    validation: (v) => { const n = parseFloat(v); return v === "" || (n >= 0.5 && n <= 2) ? null : "Must be between 0.5 and 2.0"; },
  },
  SARVAM_REALTIME_LLM_MODEL: {
    label: "Realtime voice-agent LLM",
    hint: "Dialogue model for realtime phone sessions. Default: sarvam-105b-conversations.",
  },
  SARVAM_REALTIME_TTS_ENABLED: {
    label: "Streaming TTS for phone calls",
    hint: "Bulbul WebSocket streaming on Sarvam phone calls. The browser realtime voice agent always streams.",
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

// Payments (Settings → Payments), the public URL + landing widget key
// (Settings → Website & widget) and provider keys/models (Settings → AI
// Platform) each have ONE home. This panel only holds what lives nowhere else.
export const ENV_CATEGORIES = ["ai", "phone"] as const;
export type Category = (typeof ENV_CATEGORIES)[number];

/** Noun used in the per-tab Save button ("Save AI settings"). */
const CATEGORY_SAVE_NOUN: Record<Category, string> = {
  ai: "voice & AI runtime",
  phone: "phone",
};

const CATEGORY_LABELS: Record<Category, { icon: React.ReactNode; short: string; title: string; description: string }> = {
  ai: {
    icon: <SlidersHorizontal className="w-4 h-4" />, short: "Voice & AI runtime", title: "Voice & AI runtime",
    description: "Feature switches, secrets and platform-wide limits for the voice providers. Provider API keys, default models and voices are set in AI Platform.",
  },
  phone: {
    icon: <Smartphone className="w-4 h-4" />, short: "Phone calls", title: "Phone calls",
    description: "Connect Twilio or Vonage if you want your assistant to make real voice phone calls. Pick the provider you have an account with, then fill in its details.",
  },
};

const CATEGORY_KEYS: Record<Category, string[]> = {
  // Every key shown in the editor below MUST be listed here, or it is
  // silently dropped on Save.
  ai: [
    "ELEVENLABS_SPEECH_ENGINE_ENABLED", "ELEVENLABS_SPEECH_ENGINE_ID",
    "ELEVENLABS_CONVERSATIONAL_AI_ENABLED", "ELEVENLABS_VOICE_CLONING_ENABLED", "ELEVENLABS_VOICE_DESIGN_ENABLED",
    "ELEVENLABS_REALTIME_ENABLED",
    "ELEVENLABS_TOOL_HMAC_SECRET", "ELEVENLABS_WEBHOOK_SECRET", "ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT",
    "ELEVENLABS_DEFAULT_VOICE_ID",
    "SARVAM_TIMEOUT_MS", "SARVAM_BETA_MODELS_ENABLED", "SARVAM_DEFAULT_SPEAKER",
    "SARVAM_EMBEDDING_FALLBACK_PROVIDER", "SARVAM_TRANSLATION_ENABLED", "SARVAM_TRANSLATE_MODEL",
    "SARVAM_INR_TO_USD", "SARVAM_REALTIME_STT_MODEL", "SARVAM_REALTIME_LLM_MODEL", "SARVAM_REALTIME_TTS_ENABLED",
    "SARVAM_REALTIME_VAD_THRESHOLD", "SARVAM_REALTIME_SILENCE_MS", "SARVAM_REALTIME_MIN_SPEECH_MS", "SARVAM_TTS_PACE",
    "AI_MAX_CHAT_TOKENS", "AI_MAX_REALTIME_TOKENS", "AI_MAX_TEMPERATURE",
    "MULTILINGUAL_EMBEDDINGS_ENABLED", "MULTILINGUAL_EMBEDDINGS_BASE_URL", "MULTILINGUAL_EMBEDDINGS_API_KEY",
    "MULTILINGUAL_EMBEDDINGS_MODEL", "MULTILINGUAL_EMBEDDINGS_DIMENSION",
  ],
  phone: [
    "PHONE_PROVIDER",
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
    "VONAGE_API_KEY", "VONAGE_API_SECRET", "VONAGE_PHONE_NUMBER",
  ],
};

const PHONE_PROVIDERS = [
  { id: "twilio", label: "Twilio", blurb: "Voice calls over the Twilio programmable-voice network." },
  { id: "vonage", label: "Vonage", blurb: "Voice calls over the Vonage voice API." },
];

/** Field-metadata lookup, hoisted so callbacks close over a stable reference. */
const meta = (key: string): FieldMeta | undefined => FIELD_METADATA[key];

// ─── Panel ────────────────────────────────────────────────────────────────────

export function PlatformEnvPanel({ sections = [...ENV_CATEGORIES] }: { sections?: Category[] }) {
  const [settings, setSettings] = useState<EnvSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Category>(sections[0] ?? "ai");

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
          await savePlatformEnvSetting(key, value);
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
        <TabsList className={`w-full h-auto p-1 grid-cols-2 ${sections.length > 1 ? "grid" : "hidden"}`}>
          {sections.map((cat) => {
            const catDirty = dirtyKeysFor(CATEGORY_KEYS[cat]);
            return (
              <TabsTrigger key={cat} value={cat} className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-3 py-2">
                <div className="flex items-center gap-2">
                  {CATEGORY_LABELS[cat].icon}
                  <span className="font-medium text-xs sm:text-sm">{CATEGORY_LABELS[cat].short}</span>
                  {catDirty.length > 0 && (
                    <Badge variant="secondary" className="text-[11px] px-1.5">{catDirty.length}</Badge>
                  )}
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {sections.map((cat) => (
          <TabsContent key={cat} value={cat} className={`space-y-6 ${sections.length > 1 ? "pt-4" : "mt-0"}`}>
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
                {cat === "phone" && (
                  <PhoneCategoryEditor
                    display={display} setDraftValue={setDraftValue} isSet={isSet} clearSecret={clearSecret}
                  />
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
  const svTranslationEnabled = display("SARVAM_TRANSLATION_ENABLED") === "true";
  const speechEngineOn = display("ELEVENLABS_SPEECH_ENGINE_ENABLED") === "true";
  const elKeySet = Boolean(isSet?.("ELEVENLABS_API_KEY"));
  const svKeySet = Boolean(isSet?.("SARVAM_API_KEY"));

  const boolToggle = (key: string, checked: boolean) => setDraftValue(key, checked ? "true" : "false");

  return (
    <>
      {/* ── Where provider keys & models live ─────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">Provider API keys, default models and voices</p>
            <p className="text-xs text-muted-foreground">
              OpenAI, Gemini, Sarvam and ElevenLabs keys and model defaults are managed in one place — AI Platform → Providers &amp; Models.
            </p>
          </div>
        </div>
        <a
          href="/settings/ai"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Open AI Platform
        </a>
      </div>

      {/* ── ElevenLabs ─────────────────────────────────────────────────── */}
      <SettingsSection
        icon={<Volume2 />}
        title="ElevenLabs voice"
        description="ElevenLabs speaks and listens while Clara's own AI answers. Documents and knowledge bases never leave this platform."
      >
        <StatusPills
          items={[
            elKeySet ? { text: "API key set in AI Platform", tone: "ok" } : { text: "API key missing — add it in AI Platform", tone: "bad" },
            speechEngineOn
              ? (display("ELEVENLABS_SPEECH_ENGINE_ID") ? { text: "Speech Engine on", tone: "ok" } : { text: "Speech Engine on — ID missing", tone: "bad" })
              : { text: "Speech Engine off", tone: "neutral" },
          ]}
        />
        <div className="grid gap-3 lg:grid-cols-2">
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

        <div className="space-y-4 rounded-xl border border-border p-4">
          <h4 className="text-sm font-semibold text-foreground">Speech Engine (realtime)</h4>
          <p className="text-xs text-muted-foreground">
            Needs a Speech Engine created in your ElevenLabs dashboard, pointed at
            {" "}<code className="font-mono">/api/voice/elevenlabs/speech-engine</code> on this domain.
            Saving here starts it without a restart.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <FeatureToggle
              icon={<Waves />}
              label={FIELD_METADATA.ELEVENLABS_SPEECH_ENGINE_ENABLED.label}
              description={FIELD_METADATA.ELEVENLABS_SPEECH_ENGINE_ENABLED.hint}
              checked={speechEngineOn}
              onChange={(checked) => boolToggle("ELEVENLABS_SPEECH_ENGINE_ENABLED", checked)}
            />
            <TextField
              label={FIELD_METADATA.ELEVENLABS_SPEECH_ENGINE_ID.label}
              hint={FIELD_METADATA.ELEVENLABS_SPEECH_ENGINE_ID.hint}
              value={display("ELEVENLABS_SPEECH_ENGINE_ID")}
              onChange={(value) => setDraftValue("ELEVENLABS_SPEECH_ENGINE_ID", value)}
              placeholder="seng_..."
              mono
            />
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border p-4">
          <h4 className="text-sm font-semibold text-foreground">Fallbacks, secrets &amp; alerts</h4>
          <div className="grid gap-4 lg:grid-cols-2">
            <TextField
              label={FIELD_METADATA.ELEVENLABS_DEFAULT_VOICE_ID.label}
              hint={FIELD_METADATA.ELEVENLABS_DEFAULT_VOICE_ID.hint}
              value={display("ELEVENLABS_DEFAULT_VOICE_ID")}
              onChange={(value) => setDraftValue("ELEVENLABS_DEFAULT_VOICE_ID", value)}
              placeholder="e.g. JBFqnCBsd6RMkjVDRZzb"
              mono
            />
            <TextField
              label={FIELD_METADATA.ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT.label}
              hint={FIELD_METADATA.ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT.hint}
              value={display("ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT")}
              onChange={(value) => setDraftValue("ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT", value)}
              placeholder="80"
              inputMode="numeric"
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
          </div>
        </div>
      </SettingsSection>

      {/* ── Sarvam ─────────────────────────────────────────────────────── */}
      <SettingsSection
        icon={<Languages />}
        title="Sarvam voice & language"
        description="Indic speech, realtime relays and translation. Pipeline mode only — documents and knowledge bases never leave this platform."
      >
        <StatusPills
          items={[
            svKeySet ? { text: "API key set in AI Platform", tone: "ok" } : { text: "API key missing — add it in AI Platform", tone: "bad" },
            svTranslationEnabled ? { text: "Language services on", tone: "ok" } : { text: "Language services off", tone: "neutral" },
            { text: "Realtime voice streams (STT + TTS WebSockets)", tone: "ok" },
          ]}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <FeatureToggle
            icon={<Languages />}
            label="Language services (cross-lingual RAG)"
            description="Translation, transliteration and language identification. Organisations then choose their translation mode in their AI settings."
            checked={svTranslationEnabled}
            onChange={(checked) => boolToggle("SARVAM_TRANSLATION_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<Volume2 />}
            label={FIELD_METADATA.SARVAM_REALTIME_TTS_ENABLED.label}
            description={FIELD_METADATA.SARVAM_REALTIME_TTS_ENABLED.hint}
            checked={display("SARVAM_REALTIME_TTS_ENABLED") !== "false"}
            onChange={(checked) => boolToggle("SARVAM_REALTIME_TTS_ENABLED", checked)}
          />
          <FeatureToggle
            icon={<Gauge />}
            label="Beta open-source models"
            description="Expose the /v2 beta models in model pickers."
            checked={display("SARVAM_BETA_MODELS_ENABLED") === "true"}
            onChange={(checked) => boolToggle("SARVAM_BETA_MODELS_ENABLED", checked)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ModelSelect
            label={FIELD_METADATA.SARVAM_REALTIME_STT_MODEL.label}
            hint={FIELD_METADATA.SARVAM_REALTIME_STT_MODEL.hint}
            value={display("SARVAM_REALTIME_STT_MODEL")}
            onChange={(value) => setDraftValue("SARVAM_REALTIME_STT_MODEL", value)}
            options={[
              { value: "saaras:v3-realtime", label: "Saaras v3 realtime", meta: "default" },
              { value: "saaras:v4-realtime", label: "Saaras v4 realtime" },
            ]}
            placeholder="saaras:v3-realtime"
          />
          {(["SARVAM_REALTIME_SILENCE_MS", "SARVAM_REALTIME_VAD_THRESHOLD", "SARVAM_REALTIME_MIN_SPEECH_MS", "SARVAM_TTS_PACE"] as const).map((key) => (
            <TextField
              key={key}
              label={FIELD_METADATA[key].label}
              hint={FIELD_METADATA[key].hint}
              value={display(key)}
              onChange={(value) => setDraftValue(key, value)}
              placeholder={{ SARVAM_REALTIME_SILENCE_MS: "500", SARVAM_REALTIME_VAD_THRESHOLD: "0.3", SARVAM_REALTIME_MIN_SPEECH_MS: "250", SARVAM_TTS_PACE: "1.0" }[key]}
              inputMode="decimal"
            />
          ))}
          <ModelSelect
            label={FIELD_METADATA.SARVAM_REALTIME_LLM_MODEL.label}
            hint={FIELD_METADATA.SARVAM_REALTIME_LLM_MODEL.hint}
            value={display("SARVAM_REALTIME_LLM_MODEL")}
            onChange={(value) => setDraftValue("SARVAM_REALTIME_LLM_MODEL", value)}
            options={sarvamChatOptions()}
            placeholder="sarvam-105b-conversations"
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
          <ModelSelect
            label={FIELD_METADATA.SARVAM_DEFAULT_SPEAKER.label}
            hint={FIELD_METADATA.SARVAM_DEFAULT_SPEAKER.hint}
            value={display("SARVAM_DEFAULT_SPEAKER")}
            onChange={(value) => setDraftValue("SARVAM_DEFAULT_SPEAKER", value)}
            options={sarvamSpeakerOptions()}
            placeholder="shubh"
          />
          <ModelSelect
            label={FIELD_METADATA.SARVAM_EMBEDDING_FALLBACK_PROVIDER.label}
            hint={FIELD_METADATA.SARVAM_EMBEDDING_FALLBACK_PROVIDER.hint}
            value={display("SARVAM_EMBEDDING_FALLBACK_PROVIDER")}
            onChange={(value) => setDraftValue("SARVAM_EMBEDDING_FALLBACK_PROVIDER", value)}
            options={[
              { value: "openai", label: "OpenAI embeddings", meta: "1536 / 3072 dims" },
              { value: "gemini", label: "Gemini embeddings", meta: "768 / 3072 dims" },
              { value: "qwen", label: "Qwen embeddings (local)", meta: "1024 dims · no billing" },
            ]}
            placeholder="openai"
          />
          <TextField
            label={FIELD_METADATA.SARVAM_TIMEOUT_MS.label}
            hint={FIELD_METADATA.SARVAM_TIMEOUT_MS.hint}
            value={display("SARVAM_TIMEOUT_MS")}
            onChange={(value) => setDraftValue("SARVAM_TIMEOUT_MS", value)}
            placeholder="30000"
            inputMode="numeric"
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
      </SettingsSection>

      {/* ── Multilingual knowledge index ────────────────────────────────── */}
      <SettingsSection
        icon={<Languages />}
        title="Multilingual knowledge index"
        description="Multilingual retrieval (local Qwen3 embeddings). Organisations whose plan includes it can re-index their knowledge bases so questions in any language match documents in any language — no translation step."
      >
        <div className="space-y-4">
          <FeatureToggle
            icon={<Languages />}
            label="Offer the multilingual index"
            description="Only organisations on plans with “Multilingual knowledge index” see it. Existing indexes keep working when you turn this off."
            checked={display("MULTILINGUAL_EMBEDDINGS_ENABLED") === "true"}
            onChange={(checked) => boolToggle("MULTILINGUAL_EMBEDDINGS_ENABLED", checked)}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <TextField
              label={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_BASE_URL.label}
              hint={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_BASE_URL.hint}
              value={display("MULTILINGUAL_EMBEDDINGS_BASE_URL")}
              onChange={(value) => setDraftValue("MULTILINGUAL_EMBEDDINGS_BASE_URL", value)}
              placeholder="http://embeddings:80"
              inputMode="url"
              mono
            />
            <SecretField
              label={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_API_KEY.label}
              hint={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_API_KEY.hint}
              value={display("MULTILINGUAL_EMBEDDINGS_API_KEY")}
              onChange={(value) => setDraftValue("MULTILINGUAL_EMBEDDINGS_API_KEY", value)}
              isSet={Boolean(isSet?.("MULTILINGUAL_EMBEDDINGS_API_KEY"))}
              placeholder="Optional for self-hosted"
              onClear={() => clearSecret?.("MULTILINGUAL_EMBEDDINGS_API_KEY")}
            />
            <TextField
              label={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_MODEL.label}
              hint={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_MODEL.hint}
              value={display("MULTILINGUAL_EMBEDDINGS_MODEL")}
              onChange={(value) => setDraftValue("MULTILINGUAL_EMBEDDINGS_MODEL", value)}
              placeholder="Qwen/Qwen3-Embedding-0.6B"
              mono
            />
            <TextField
              label={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_DIMENSION.label}
              hint={FIELD_METADATA.MULTILINGUAL_EMBEDDINGS_DIMENSION.hint}
              value={display("MULTILINGUAL_EMBEDDINGS_DIMENSION")}
              onChange={(value) => setDraftValue("MULTILINGUAL_EMBEDDINGS_DIMENSION", value)}
              placeholder="Automatic"
              inputMode="numeric"
            />
          </div>
          <MultilingualEndpointTest />
        </div>
      </SettingsSection>

      {/* ── Limits ─────────────────────────────────────────────────────── */}
      <SettingsSection
        icon={<SlidersHorizontal />}
        title="Platform limits"
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

/** Checks the SAVED multilingual endpoint: latency, vector size, cross-lingual match. */
function MultilingualEndpointTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(apiUrl("/api/platform/multilingual-embeddings/test"), {
        method: "POST",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; model?: string; dimension?: number; latencyMs?: number;
        crossLingual?: { matchingPassage: number; unrelatedPassage: number; threshold: number };
      };
      setOk(Boolean(body.ok));
      setResult(
        body.error
          ? body.error
          : `${body.model} · ${body.dimension}-d · ${body.latencyMs} ms · English question ↔ Tamil answer ${body.crossLingual?.matchingPassage} vs unrelated ${body.crossLingual?.unrelatedPassage} (evidence cut-off ${body.crossLingual?.threshold})`,
      );
    } catch (error) {
      setOk(false);
      setResult((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 disabled:opacity-60"
      >
        {busy ? "Testing…" : "Test saved endpoint"}
      </button>
      {result && (
        <span role="status" className={ok ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-destructive"}>
          {result}
        </span>
      )}
    </div>
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
