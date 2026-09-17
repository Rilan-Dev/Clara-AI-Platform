/**
 * src/modules/voice-elevenlabs/core/config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Environment parsing, kill switches, and the canonical TTS/STT model
 * catalogue for the ElevenLabs integration.
 *
 * All configuration is SERVER-ONLY. ELEVENLABS_API_KEY never appears in any
 * NEXT_PUBLIC_ variable, never crosses an API boundary, and is scrubbed
 * from logs via src/lib/redact.ts.
 */

import type { ElevenLabsTTSModel } from "./types";

// ─── Kill switches / flags ───────────────────────────────────────────────────

export function isElevenLabsEnabled(): boolean {
  return (process.env.ELEVENLABS_ENABLED ?? "false").toLowerCase() === "true"
    && Boolean(getElevenLabsApiKey());
}

/** Mode B (Conversational AI agents) — separate, stricter flag. */
export function isConversationalAIEnabled(): boolean {
  return (process.env.ELEVENLABS_CONVERSATIONAL_AI_ENABLED ?? "false").toLowerCase() === "true";
}

export function isVoiceCloningEnabled(): boolean {
  return (process.env.ELEVENLABS_VOICE_CLONING_ENABLED ?? "false").toLowerCase() === "true";
}

// ─── Core connection settings ────────────────────────────────────────────────

export function getElevenLabsApiKey(): string | undefined {
  const value = process.env.ELEVENLABS_API_KEY?.trim();
  return value || undefined;
}

/**
 * Fixed base URL — an SSRF guard. No request field ever becomes a URL;
 * voice ids are opaque strings validated against the DB catalog first.
 */
export function getElevenLabsBaseUrl(): string {
  return (process.env.ELEVENLABS_API_BASE_URL ?? "https://api.elevenlabs.io").trim().replace(/\/+$/, "");
}

export function getElevenLabsTimeoutMs(): number {
  const value = Number(process.env.ELEVENLABS_TIMEOUT_MS ?? "30000");
  return Number.isFinite(value) && value > 0 ? value : 30_000;
}

// ─── Platform default models / voice ─────────────────────────────────────────

export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
export const DEFAULT_STT_MODEL = "scribe_v1";

export function getPlatformDefaultTTSModel(): string {
  return process.env.ELEVENLABS_DEFAULT_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
}

export function getPlatformDefaultSTTModel(): string {
  return process.env.ELEVENLABS_DEFAULT_STT_MODEL?.trim() || DEFAULT_STT_MODEL;
}

export function getPlatformDefaultVoiceId(): string | null {
  return process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() || null;
}

// ─── Request caps (abuse guards — see plan §11.8) ────────────────────────────

export const TTS_MAX_CHARS_PER_REQUEST = 2_000;
export const TTS_PREVIEW_MAX_CHARS = 300;
export const STT_MAX_AUDIO_SECONDS = 120;
export const STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const TTS_OUTPUT_FORMAT = "pcm_16000";

// ─── Canonical TTS model catalogue ───────────────────────────────────────────
//
// Mirrors the philosophy of src/modules/ai-core/model-catalog.ts: a curated
// single source of truth used by settings UIs (dropdowns), write validation,
// and usage pricing. Prices are per 1,000 characters in USD; verify against
// the live pricing page when billing goes live.

export const ELEVENLABS_TTS_MODELS: ElevenLabsTTSModel[] = [
  {
    modelId: "eleven_flash_v2_5",
    name: "Eleven Flash v2.5",
    latencyClass: "low",
    maxCharactersPerRequest: 40_000,
    usdPer1kChars: 0.06,
    multilingual: true,
  },
  {
    modelId: "eleven_turbo_v2_5",
    name: "Eleven Turbo v2.5",
    latencyClass: "low",
    maxCharactersPerRequest: 40_000,
    usdPer1kChars: 0.08,
    multilingual: true,
  },
  {
    modelId: "eleven_multilingual_v2",
    name: "Eleven Multilingual v2",
    latencyClass: "medium",
    maxCharactersPerRequest: 10_000,
    usdPer1kChars: 0.15,
    multilingual: true,
  },
  {
    modelId: "eleven_v3",
    name: "Eleven v3 (alpha)",
    latencyClass: "medium",
    maxCharactersPerRequest: 10_000,
    usdPer1kChars: 0.15,
    multilingual: true,
  },
];

export function findTTSModel(modelId: string): ElevenLabsTTSModel | undefined {
  return ELEVENLABS_TTS_MODELS.find((model) => model.modelId === modelId.trim());
}

export function isSupportedTTSModel(modelId: string): boolean {
  return findTTSModel(modelId) != null;
}

/** Well-formed ElevenLabs voice ids are 20-char alphanumeric slugs. */
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{17,25}$/;

export function looksLikeElevenLabsVoiceId(value: string): boolean {
  return VOICE_ID_PATTERN.test(value.trim());
}
