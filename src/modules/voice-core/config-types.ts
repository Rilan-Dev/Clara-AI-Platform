/**
 * src/modules/voice-core/config-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolution types for the voice-provider axis — mirrors
 * src/modules/ai-core/config-types.ts (the brain axis equivalent).
 *
 * Consumers: organisations / knowledge-bases core DB layers (row shapes),
 * voice-core/resolve.ts (resolution contract), and the voice API handlers
 * (session bootstrap payload).
 */

import type { ResolvedAIConfig } from "@/modules/ai-core/config-types";
import type { ElevenLabsVoiceSettings, VoiceProvider } from "./types";

// ─── Resolution input ────────────────────────────────────────────────────────

export interface ResolveVoiceConfigInput {
  kbId?: string;
  orgId?: string;
  surface: "realtime" | "embed";
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

/** Sarvam specifics resolved when either voice purpose selects "sarvam". */
export interface SarvamResolvedConfig {
  /** TTS model id (bulbul:v3 | bulbul:v2 legacy). */
  ttsModel: string;
  /** STT model id (saaras:v3 | saaras:v4). */
  sttModel: string;
  /** Bulbul speaker id — static catalogue, validated by isSupportedSarvamSpeaker. */
  speaker: string;
  /** BCP-47-ish language hint derived from the agent language chain (hi-IN, ta-IN, …). */
  language: string;
  /** Playback sample rate for the shared PCM queue (16000 default). */
  sampleRate: number;
  /** True when the realtime STT relay is available (V5 — capability flag). */
  realtimeSttEnabled: boolean;
}

/**
 * Result of resolveVoiceConfig(): which provider serves each voice PURPOSE,
 * the (untouched) brain config, and the ElevenLabs specifics when selected.
 *
 * Two purposes are resolved in one pass:
 *   • voiceProvider (voice-chat purpose) — the chat-window voice-chat
 *     experience (Mode A pipeline for ElevenLabs; the provider's realtime
 *     socket for OpenAI/Gemini, which have no separate STT/TTS pipeline).
 *   • realtimeProvider (realtime purpose) — the real-time voice assistant
 *     surfaces (floating voice modal, embed voice, Agents, phone).
 *     NULL-configured at every level = inherit the voice-chat value, so
 *     picking ONE provider keeps everything native to it.
 */
export interface VoiceResolution {
  voiceProvider: VoiceProvider;
  source: "kb_override" | "agent_settings" | "agent" | "org" | "env";
  /** Realtime-assistant purpose (inherits voiceProvider when unset everywhere). */
  realtimeProvider: VoiceProvider;
  realtimeSource: "kb_override" | "agent_settings" | "agent" | "org" | "voice_chat";
  /** Brain config resolved via the existing resolveAIConfig() — unchanged. */
  brain: ResolvedAIConfig;
  elevenlabs: ElevenLabsResolvedConfig | null;
  /** Sarvam specifics — non-null when either voice purpose selects "sarvam". */
  sarvam: SarvamResolvedConfig | null;
}

// ─── Session bootstrap payload (hybrid pipeline, Mode A) ─────────────────────

/**
 * Returned by POST /api/voice/elevenlabs/session. Capability descriptors
 * ONLY — never keys. The browser drives the pipeline through platform
 * endpoints; it never talks to the voice vendor directly in Mode A.
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

/**
 * Returned by POST /api/voice/sarvam/session. Same capability-descriptor-only
 * posture as the ElevenLabs payload: never keys, never vendor URLs — the
 * browser drives the pipeline through platform endpoints.
 */
export interface SarvamSessionPayload {
  mode: "pipeline";
  stt: {
    endpoint: string;
    model: string;
    language: string;
    sampleRate: number;
    maxAudioSeconds: number;
    /** V5 realtime relay — present when the relay capability is on. */
    realtime?: {
      endpoint: string;
      /** Session-minted HMAC token (?token= on the WS upgrade). */
      token: string;
      sampleRate: number;
      encoding: string;
      vadSilenceMs: number;
    };
  };
  tts: {
    endpoint: string;
    model: string;
    speaker: string;
    outputFormat: string;
    language: string;
  };
  chat: {
    endpoint: string;
    kbId: string | null;
    ragMode: string;
  };
  provider: "sarvam";
  kbId: string | null;
  ragMode: string;
  languages: string[];
}
