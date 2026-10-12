/**
 * src/components/admin/ai-settings-options.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared option lists for the AI settings editors.
 *
 * OrgAIConfigEditor (organisation level) and PlatformEnvPanel (platform level)
 * previously each kept their own — slightly diverging — model and voice lists.
 * They now draw from this single module so the organisation picker and the
 * platform picker always offer the same choices.
 *
 * Chat + embedding models come from the canonical catalogues
 * (src/modules/ai-core/model-catalog.ts) — this file only owns the lists that
 * have no catalogue home yet: realtime, transcription, voices, languages and
 * the provider marketing copy shown on the option cards.
 */

import {
  SARVAM_TTS_MODELS,
  SARVAM_STT_MODELS,
  SARVAM_SPEAKERS,
} from "@/modules/voice-core/model-catalog";
import { SUPPORTED_LANGUAGES } from "@/modules/assistant/core/config";

// ─── Brain providers (option cards) ──────────────────────────────────────────

export const BRAIN_PROVIDERS: { id: "openai" | "gemini" | "sarvam"; label: string; blurb: string }[] = [
  { id: "openai", label: "OpenAI", blurb: "GPT models — chat, embeddings, realtime" },
  { id: "gemini", label: "Google Gemini", blurb: "Gemini models — chat, embeddings, Live API" },
  {
    id: "sarvam",
    label: "Sarvam AI",
    blurb: "Sarvam-105B — Indic-first chat, 128K context (embeddings stay on the platform backbone)",
  },
];

// ─── Live model option adapters ───────────────────────────────────────────────
// Provider model availability comes from /api/platform/ai/providers/:providerId
// or /api/agents/:agentId/ai-options. The vendor model-list APIs do not expose
// authoritative prices/release dates consistently, so ranking only uses those
// metadata fields when the provider catalogue has them.

export type LiveAIModelOption = {
  modelId: string;
  displayName: string;
  kind: string;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
};

function sortLiveModels(models: LiveAIModelOption[]): LiveAIModelOption[] {
  return [...models].sort((a, b) => {
    const price = (m: LiveAIModelOption) => {
      const values = [m.metadata?.inputUsdPerMTokens, m.metadata?.usdPer1kChars, m.metadata?.usdPerMinute];
      const known = values.find((value) => typeof value === "number" && Number.isFinite(value));
      return typeof known === "number" ? known : Number.POSITIVE_INFINITY;
    };
    const priceDiff = price(a) - price(b);
    if (priceDiff !== 0 && Number.isFinite(priceDiff)) return priceDiff;
    const release = (m: LiveAIModelOption) => typeof m.metadata?.releaseDate === "string" ? m.metadata.releaseDate : "";
    const releaseDiff = release(b).localeCompare(release(a));
    if (releaseDiff) return releaseDiff;
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

function liveOptions(models: LiveAIModelOption[], kinds: string[]) {
  return sortLiveModels(models.filter((model) => kinds.includes(model.kind))).map((model) => {
    const tokenPrice = model.metadata?.inputUsdPerMTokens;
    const charPrice = model.metadata?.usdPer1kChars;
    const minutePrice = model.metadata?.usdPerMinute;
    const dimension = model.metadata?.dimension;
    const meta = typeof tokenPrice === "number" ? `$${tokenPrice}/M input`
      : typeof charPrice === "number" ? `$${charPrice}/1k chars`
      : typeof minutePrice === "number" ? `$${minutePrice}/min`
      : typeof dimension === "number" ? `${dimension} dims`
      : undefined;
    return { value: model.modelId, label: model.displayName || model.modelId, meta };
  });
}

export function openaiChatOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["chat"]);
}

export function geminiChatOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["chat"]);
}

export function openaiEmbeddingOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["embedding"]);
}

export function geminiEmbeddingOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["embedding"]);
}

export function realtimeOptions(
  provider: "openai" | "gemini" | "sarvam",
  liveModels: LiveAIModelOption[] = [],
) {
  if (provider === "sarvam") {
    // Sarvam realtime is a composed pipeline, not a single vendor Live model.
    return liveOptions(liveModels, ["chat"]);
  }
  return liveOptions(liveModels, ["realtime"]);
}

export function transcriptionOptions(
  provider: "openai" | "gemini" | "sarvam",
  liveModels: LiveAIModelOption[] = [],
) {
  if (provider === "sarvam") return liveOptions(liveModels, ["stt", "transcription"]);
  return liveOptions(liveModels, ["transcription", "stt"]);
}

export function sarvamRealtimeSttOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["stt", "transcription"]);
}

export function sarvamRealtimeTtsOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["tts"]);
}

export function voiceOptions(provider: "openai" | "gemini", liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["voice"]);
}

export function elevenlabsTtsOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["tts"]);
}

export function elevenlabsSttOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["stt", "transcription"]);
}

export function elevenlabsRealtimeSttOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["stt", "transcription"]);
}

export function elevenlabsRealtimeTtsOptions(liveModels: LiveAIModelOption[] = []) {
  return liveOptions(liveModels, ["tts"]);
}

// ─── Sarvam (voice axis — pipeline only, static catalogue by design) ────────

export function sarvamChatOptions(liveModels: LiveAIModelOption[] = []) {
  // Model availability comes from the same live governance catalogue as the
  // other providers; this helper no longer owns a static Sarvam model list.
  return liveOptions(liveModels, ["chat"]);
}

export function sarvamTtsOptions() {
  return SARVAM_TTS_MODELS.map((m) => ({
    value: m.modelId,
    label: m.name,
    meta: `$${m.usdPer1kChars}/1k chars`,
  }));
}

export function sarvamSttOptions() {
  return SARVAM_STT_MODELS.map((m) => ({
    value: m.modelId,
    label: m.name,
    meta: `$${(m.usdPerMinute * 60).toFixed(2)}/h`,
  }));
}

export function sarvamSpeakerOptions() {
  return SARVAM_SPEAKERS.map((s) => ({
    value: s.id,
    label: s.name,
    meta: s.gender === "female" ? "female" : "male",
  }));
}

// ─── Languages ───────────────────────────────────────────────────────────────

/**
 * Market-first head for the settings pickers: the platform's primary markets
 * (English, Sinhala, Tamil, Hindi, Arabic...) lead, then the remaining global
 * languages follow alphabetically. The tail is derived from the canonical
 * SUPPORTED_LANGUAGES catalog so this list can never drift below it again —
 * the two used to be maintained by hand (18 here vs 57 there), which is how
 * Sinhala/Urdu/Bengali and 40+ other catalog languages went missing from the
 * settings UI.
 */
const MARKET_LANGUAGE_CODES = [
  "en", "si", "ta", "hi", "ar",
  "zh", "ja", "ko", "es", "fr",
  "de", "pt", "ru", "it", "id",
  "tr", "vi", "th",
] as const;

const MARKET_LANGUAGE_SET = new Set<string>(MARKET_LANGUAGE_CODES);

// Widen the readonly literal catalogue into the mutable { code, label } shape
// the settings pickers consume.
const CATALOG_LANGUAGES: { code: string; label: string }[] =
  SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, label: l.label }));

export const COMMON_LANGUAGES: { code: string; label: string }[] = [
  // 1. Market languages in the curated order users already know.
  ...MARKET_LANGUAGE_CODES
    .map((code) => CATALOG_LANGUAGES.find((l) => l.code === code))
    .filter((l): l is { code: string; label: string } => Boolean(l)),
  // 2. Every other catalog language, alphabetical by label.
  ...CATALOG_LANGUAGES.filter((l) => !MARKET_LANGUAGE_SET.has(l.code)),
];
