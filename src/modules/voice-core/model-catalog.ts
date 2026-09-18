/**
 * src/modules/voice-core/model-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical TTS/STT model catalogue, request caps, and env-default parsing
 * for the voice-provider axis — mirrors the role of
 * src/modules/ai-core/model-catalog.ts on the brain axis.
 *
 * This module is the single source of truth used by:
 *   • the settings UIs      — dropdowns only offer catalogued TTS models
 *                             (components/admin/PlatformEnvPanel,
 *                              components/admin/OrgAIConfigEditor)
 *   • the settings APIs     — writes are rejected when an unsupported
 *                             ElevenLabs TTS model id is stored
 *                             (organisations/api/ai-settings.ts)
 *   • voice-core/resolve    — kill switch + provider default models + voice
 *                             id shape validation during resolution
 *   • voice-core/pricing    — per-model price list → cost per invocation
 *
 * All configuration is SERVER-ONLY. ELEVENLABS_API_KEY never appears in any
 * NEXT_PUBLIC_ variable, never crosses an API boundary, and is scrubbed from
 * logs via src/lib/redact.ts.
 */

import type { VoiceProvider } from "./types";

// ─── Catalogue entries ───────────────────────────────────────────────────────

export interface ElevenLabsTTSModel {
  modelId: string;
  name: string;
  /** Rough relative latency class for UI hints. */
  latencyClass: "low" | "medium" | "high";
  maxCharactersPerRequest: number;
  /** USD per 1,000 characters — see pricing.ts for overrides. */
  usdPer1kChars: number;
  multilingual: boolean;
}

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

// ─── Request caps (abuse guards — see plan §11.8) ────────────────────────────

export const TTS_MAX_CHARS_PER_REQUEST = 2_000;
export const TTS_PREVIEW_MAX_CHARS = 300;
export const STT_MAX_AUDIO_SECONDS = 120;
export const STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const TTS_OUTPUT_FORMAT = "pcm_16000";

// ─── Kill switches / flags ───────────────────────────────────────────────────

/**
 * Platform-level availability gate for the ElevenLabs voice provider.
 * Requires BOTH the explicit opt-in flag and a usable API key.
 */
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

/** Voice Design (prompt → voice) — V5, off by default. */
export function isVoiceDesignEnabled(): boolean {
  return (process.env.ELEVENLABS_VOICE_DESIGN_ENABLED ?? "false").toLowerCase() === "true";
}

// ─── Mode-B callback secrets ────────────────────────────────────────────────

/**
 * HMAC secret for the internal RAG server-tool callback
 * (/api/internal/elevenlabs/tools/rag-search). REQUIRED before any Mode-B
 * agent can be created — the agent's server tool is registered with this
 * secret at the vendor, and every callback is verified against it.
 */
export function getToolHmacSecret(): string | undefined {
  const value = process.env.ELEVENLABS_TOOL_HMAC_SECRET?.trim();
  return value || undefined;
}

/**
 * Signing secret for ElevenLabs post-call webhooks
 * (/api/webhooks/elevenlabs/post-call). REQUIRED before the webhook URL is
 * handed to the vendor.
 */
export function getWebhookSecret(): string | undefined {
  const value = process.env.ELEVENLABS_WEBHOOK_SECRET?.trim();
  return value || undefined;
}

// ─── V6 credit-burn alerting ────────────────────────────────────────────────

/**
 * Alert threshold for the ElevenLabs character budget, in percent consumed
 * (V6). 0 disables alerting.
 */
export function getCreditAlertThresholdPct(): number {
  const value = Number(process.env.ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT ?? "80");
  return Number.isFinite(value) && value > 0 && value <= 100 ? Math.round(value) : 80;
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

// ─── Voice id shape validation ───────────────────────────────────────────────

/**
 * Well-formed vendor voice ids are 17–25 char alphanumeric slugs. Unlike
 * OPENAI_REALTIME_VOICES (a fixed enumerable set), vendor voice ids are not
 * enumerable, so resolution validates shape + org-catalog membership instead.
 */
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{17,25}$/;

export function looksLikeElevenLabsVoiceId(value: string): boolean {
  return VOICE_ID_PATTERN.test(value.trim());
}

// ─── Request id shape validation ─────────────────────────────────────────────

/**
 * kb/org/agent ids are Postgres UUIDs — a malformed one must die as a 400
 * BEFORE any DB query, or the driver surfaces "invalid input syntax for type
 * uuid" as a 500 (guard-discipline violation, caught by the V6 load test).
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

// ─── Provider registry metadata ──────────────────────────────────────────────

/**
 * Human-facing provider descriptors for settings UIs. Kept beside the
 * catalogue so a new voice provider is registered in exactly one place.
 */
export const VOICE_PROVIDER_LABELS: Record<VoiceProvider, string> = {
  openai: "OpenAI Realtime",
  gemini: "Gemini Live",
  elevenlabs: "ElevenLabs (hybrid)",
};
