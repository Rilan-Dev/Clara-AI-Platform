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
  OPENAI_CHAT_MODELS,
  OPENAI_EMBEDDING_MODELS,
  GEMINI_CHAT_MODELS,
  GEMINI_EMBEDDING_MODELS,
} from "@/modules/ai-core/model-catalog";
import { ELEVENLABS_TTS_MODELS } from "@/modules/voice-core/model-catalog";
import { SUPPORTED_LANGUAGES } from "@/modules/assistant/core/config";

// ─── Brain providers (option cards) ──────────────────────────────────────────

export const BRAIN_PROVIDERS: { id: "openai" | "gemini"; label: string; blurb: string }[] = [
  { id: "openai", label: "OpenAI", blurb: "GPT models — chat, embeddings, realtime" },
  { id: "gemini", label: "Google Gemini", blurb: "Gemini models — chat, embeddings, Live API" },
];

// ─── Realtime / transcription / voices ───────────────────────────────────────
// Superset of every list previously hardcoded across the two editors.

export const OPENAI_REALTIME_MODELS = [
  "gpt-realtime-2.1-mini",
  "gpt-realtime-2.1",
  "gpt-realtime-2025-08-28",
  "gpt-4o-realtime-preview",
  "gpt-4o-realtime-preview-2024-12-17",
  "gpt-4o-realtime-preview-2024-10-01",
  "gpt-4o-mini-realtime-preview",
  "gpt-4o-mini-realtime-preview-2024-12-17",
] as const;

export const OPENAI_TRANSCRIPTION_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
] as const;

export const OPENAI_REALTIME_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "shimmer",
  "verse", "marin", "cedar", "sage",
] as const;

export const GEMINI_REALTIME_MODELS = [
  "gemini-2.5-flash-native-audio",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.0-flash-live",
  "gemini-2.0-flash-native-audio-preview",
  "gemini-2.0-flash-exp-native-audio",
] as const;

export const GEMINI_TRANSCRIPTION_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
] as const;

export const GEMINI_VOICES = [
  "Aoede", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Zephyr",
] as const;

// ─── Dropdown option builders (with catalogue metadata) ──────────────────────

export function openaiChatOptions() {
  return OPENAI_CHAT_MODELS.map((m) => ({
    value: m.id,
    label: m.label ?? m.id,
    meta: m.inputUsdPerMTokens != null ? `$${m.inputUsdPerMTokens}/M in` : undefined,
  }));
}

export function geminiChatOptions() {
  return GEMINI_CHAT_MODELS.map((m) => ({
    value: m.id,
    label: m.label ?? m.id,
    meta: m.inputUsdPerMTokens != null ? `$${m.inputUsdPerMTokens}/M in` : undefined,
  }));
}

export function openaiEmbeddingOptions() {
  return OPENAI_EMBEDDING_MODELS.map((m) => ({
    value: m.id,
    label: m.id,
    meta: `${m.dimension} dims`,
  }));
}

export function geminiEmbeddingOptions() {
  return GEMINI_EMBEDDING_MODELS.map((m) => ({
    value: m.id,
    label: m.id,
    meta: `${m.dimension} dims`,
  }));
}

export function realtimeOptions(provider: "openai" | "gemini") {
  const ids = provider === "gemini" ? GEMINI_REALTIME_MODELS : OPENAI_REALTIME_MODELS;
  return ids.map((id) => ({ value: id, label: id }));
}

export function transcriptionOptions(provider: "openai" | "gemini") {
  const ids = provider === "gemini" ? GEMINI_TRANSCRIPTION_MODELS : OPENAI_TRANSCRIPTION_MODELS;
  return ids.map((id) => ({ value: id, label: id }));
}

export function voiceOptions(provider: "openai" | "gemini") {
  const ids = provider === "gemini" ? GEMINI_VOICES : OPENAI_REALTIME_VOICES;
  return ids.map((id) => ({ value: id, label: id }));
}

export function elevenlabsTtsOptions() {
  return ELEVENLABS_TTS_MODELS.map((m) => ({
    value: m.modelId,
    label: m.name,
    meta: `$${m.usdPer1kChars}/1k chars`,
  }));
}

export function elevenlabsSttOptions() {
  return [{ value: "scribe_v1", label: "Scribe v1" }];
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
