/**
 * src/modules/voice-elevenlabs/core/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type contracts for the ElevenLabs voice integration.
 *
 * Architecture (see Doc/ELEVENLABS_INTEGRATION_PLAN.md §3):
 *   ElevenLabs is a VOICE layer, never a BRAIN layer. The AIProvider union
 *   (openai | gemini) that drives chat + embeddings + RAG is untouched.
 *   Voice-provider selection is a separate, orthogonal axis resolved by
 *   resolveVoiceConfig() for the realtime/embed surfaces only.
 */

import type { ResolvedAIConfig } from "@/modules/ai-core/config-types";

// ─── Voice provider axis ─────────────────────────────────────────────────────

/**
 * Providers that can serve the VOICE surface:
 *   - "openai"     → OpenAI Realtime (WebRTC, existing path)
 *   - "gemini"     → Gemini Live (WebSocket, existing path)
 *   - "elevenlabs" → Hybrid pipeline: ElevenLabs Scribe STT + platform
 *                    RAG/chat + ElevenLabs TTS (new). Documents/KBs never
 *                    leave the platform in this mode.
 */
export type VoiceProvider = "openai" | "gemini" | "elevenlabs";

export const VOICE_PROVIDERS: VoiceProvider[] = ["openai", "gemini", "elevenlabs"];

export function isVoiceProvider(value: unknown): value is VoiceProvider {
  return value === "openai" || value === "gemini" || value === "elevenlabs";
}

// ─── ElevenLabs voice settings (TTS tuning) ──────────────────────────────────

/**
 * Per-voice TTS tuning knobs, persisted on agent AI settings metadata and
 * passed through to the TTS endpoint. All optional — ElevenLabs applies its
 * per-voice trained defaults when omitted.
 */
export interface ElevenLabsVoiceSettings {
  /** 0..1 — higher = more consistent, lower = more expressive. */
  stability?: number;
  /** 0..1 — how strictly the output mimics the source voice. */
  similarityBoost?: number;
  /** 0..1 — exaggerates the style of the source voice. */
  style?: number;
  /** 0.7..1.2 — playback speed multiplier. */
  speed?: number;
  /** Boost fidelity for speakers in the reference audio. */
  speakerBoost?: boolean;
}

// ─── Resolution output ───────────────────────────────────────────────────────

export interface ElevenLabsResolvedConfig {
  /** TTS model id (eleven_flash_v2_5 | eleven_turbo_v2_5 | eleven_multilingual_v2 | eleven_v3). */
  ttsModel: string;
  /** STT model id (scribe_v1). */
  sttModel: string;
  /** Voice id — validated against the org catalog or platform default. */
  voiceId: string;
  voiceSettings: ElevenLabsVoiceSettings;
  /** BCP-47-ish language hint derived from the agent language chain. */
  language: string;
}

/**
 * Result of resolveVoiceConfig(): which provider serves the voice surface,
 * the (untouched) brain config, and the ElevenLabs specifics when selected.
 */
export interface VoiceResolution {
  voiceProvider: VoiceProvider;
  source: "kb_override" | "agent_settings" | "org" | "env";
  /** Brain config resolved via the existing resolveAIConfig() — unchanged. */
  brain: ResolvedAIConfig;
  elevenlabs: ElevenLabsResolvedConfig | null;
}

// ─── Session bootstrap payload (Mode A pipeline) ─────────────────────────────

/**
 * Returned by POST /api/voice/elevenlabs/session. Capability descriptors
 * ONLY — never keys. The browser drives the pipeline through platform
 * endpoints; it never talks to ElevenLabs directly in Mode A.
 */
export interface ElevenLabsSessionPayload {
  mode: "pipeline";
  stt: {
    endpoint: string;
    model: string;
    language: string;
    sampleRate: number;
    maxAudioSeconds: number;
  };
  tts: {
    endpoint: string;
    model: string;
    voiceId: string;
    outputFormat: string;
    voiceSettings: ElevenLabsVoiceSettings;
  };
  chat: {
    endpoint: string;
    kbId: string | null;
    ragMode: string;
  };
  provider: "elevenlabs";
  kbId: string | null;
  ragMode: string;
}

// ─── Catalog types ───────────────────────────────────────────────────────────

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  previewUrl: string | null;
}

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

export interface ElevenLabsSubscriptionInfo {
  tier: string;
  characterCount: number;
  characterLimit: number;
  nextCharacterCountResetUnix: number | null;
  voiceLimit: number;
  canUseInstantCloning: boolean;
}
