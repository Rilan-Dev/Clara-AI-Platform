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
