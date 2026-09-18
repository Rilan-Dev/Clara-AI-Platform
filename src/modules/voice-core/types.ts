/**
 * src/modules/voice-core/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Type contracts for the VOICE provider axis.
 *
 * Architecture (Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md §3):
 *   Voice is a separate axis from the brain. The AIProvider union
 *   (openai | gemini) drives chat + embeddings + RAG and lives in
 *   src/modules/ai-core. The VoiceProvider union below decides WHO serves
 *   the voice surface (realtime / embed), resolved by resolveVoiceConfig().
 *
 *   - "openai"     → OpenAI Realtime (WebRTC; session minted server-side by
 *                    assistant/api/realtime.ts, driven client-side by the
 *                    useOpenAIRealtime hook — no server voice service).
 *   - "gemini"     → Gemini Live (WebSocket; same shape as openai).
 *   - "elevenlabs" → Hybrid pipeline (Scribe STT + platform RAG/chat +
 *                    streaming TTS). Documents/KBs never leave the platform
 *                    in this mode — the only provider with a server-side
 *                    VoiceProviderService implementation today.
 *
 * This file mirrors src/modules/ai-core/types.ts one-for-one so the two axes
 * stay recognisably parallel:
 *
 *   ai-core/types.ts                 voice-core/types.ts
 *   ───────────────────────────      ──────────────────────────────
 *   AIProvider        (union)        VoiceProvider           (union)
 *   LLMProvider     (interface)      VoiceProviderService  (interface)
 *   ProviderConfig   (construct)     VoiceServiceConfig     (construct)
 */

// ─── Voice provider axis ─────────────────────────────────────────────────────

export type VoiceProvider = "openai" | "gemini" | "elevenlabs";

export const VOICE_PROVIDERS: VoiceProvider[] = ["openai", "gemini", "elevenlabs"];

export function isVoiceProvider(value: unknown): value is VoiceProvider {
  return value === "openai" || value === "gemini" || value === "elevenlabs";
}

// ─── TTS voice tuning (hybrid pipeline) ──────────────────────────────────────

/**
 * Per-voice TTS tuning knobs, persisted on agent AI settings metadata and
 * passed through to the TTS endpoint. All optional — the vendor applies its
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

// ─── Vendor payload types (service interface surface) ────────────────────────

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  description: string | null;
  previewUrl: string | null;
}

export interface ElevenLabsSubscriptionInfo {
  tier: string;
  characterCount: number;
  characterLimit: number;
  nextCharacterCountResetUnix: number | null;
  voiceLimit: number;
  canUseInstantCloning: boolean;
}

export interface TranscribeParams {
  file: Blob;
  modelId: string;
  languageCode?: string | null;
}

export interface TranscribeResult {
  text: string;
  languageCode: string | null;
  /** Duration reported by the provider, when available. */
  durationSeconds: number | null;
}

export interface SpeakParams {
  text: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  languageCode?: string | null;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  speakerBoost?: boolean;
}

// ─── Service interface ───────────────────────────────────────────────────────

/**
 * Server-side voice vendor service — the "adapter" contract for providers
 * that execute voice work server-side (STT / TTS / catalog / health).
 *
 * Realtime providers ("openai" | "gemini") do NOT implement this interface:
 * their voice surface is a client-side realtime session whose ephemeral
 * token is minted by src/modules/assistant/api/realtime.ts. When a future
 * provider needs server-side speech (e.g. a second TTS vendor), it drops a
 * file into providers/, implements this interface, and registers one case
 * in factory.ts — nothing else changes.
 */
export interface VoiceProviderService {
  /**
   * Account health / quota probe (subscription tier, credit burn-down).
   */
  getSubscriptionInfo(): Promise<ElevenLabsSubscriptionInfo>;

  /**
   * Lists the vendor workspace's usable voices (ids + labels only —
   * voice definitions and audio stay at the vendor).
   */
  listVoices(): Promise<ElevenLabsVoice[]>;

  /**
   * Transcribes one utterance of user audio (speech-in).
   */
  transcribeAudio(params: TranscribeParams): Promise<TranscribeResult>;

  /**
   * Synthesises speech for answer text (speech-out). Returns the raw
   * streaming Response so route handlers can pipe it through without
   * buffering the whole clip in memory.
   */
  speak(params: SpeakParams): Promise<Response>;

  /**
   * Returns the name of the provider (e.g., 'elevenlabs').
   */
  getProviderName(): VoiceProvider;
}

// ─── Provider construction config ────────────────────────────────────────────

export interface VoiceServiceConfig {
  provider: VoiceProvider;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}
