/**
 * Type declarations for the Node-side relay scripts imported by unit tests.
 * The implementations live in scripts/*.mjs (excluded from typecheck); these
 * ambient declarations give the test imports strict types.
 */

declare module "*/scripts/sarvam-relay.mjs" {
  export function handleSarvamRealtimeConnection(
    browserWs: unknown,
    req: unknown,
  ): Promise<void>;

  /** Extract transcript text from a vendor event envelope. */
  export function transcriptText(event: Record<string, unknown>): string;

  /** Map a resolved Saaras STT id to the vendor realtime-WS model id. */
  export function toRealtimeModel(model: string | null | undefined): string;

  /** Normalize a language code for the realtime endpoint (od-IN → or-IN). */
  export function normalizeRealtimeLanguage(code: string | null | undefined): string;

  /**
   * Map an upstream vendor event to the browser frame contract.
   * Returns null for events intentionally not forwarded (session.begin, pong).
   */
  export function translateUpstreamEvent(
    event: Record<string, unknown>,
  ): { type: string; [key: string]: unknown } | null;
}

declare module "*/scripts/sarvam-tts-relay.mjs" {
  export function handleSarvamTtsRealtimeConnection(
    browserWs: unknown,
    req: unknown,
  ): Promise<void>;

  /**
   * Per-generation character metering — emits exactly one meter callback per
   * generationId (accumulates chars; settles on generation switch or end).
   */
  export function createGenerationMeter(meter: (entry: {
    generationId: string | null;
    characters: number;
  }) => void): {
    add(nextGenerationId: string | null | undefined, text: string): void;
    settle(): void;
  };
}

declare module "*/scripts/elevenlabs-relay.mjs" {
  export function handleElevenLabsRealtimeStt(browserWs: unknown, req: unknown): Promise<void>;
  export function handleElevenLabsRealtimeTts(browserWs: unknown, req: unknown): Promise<void>;

  /** Verify a session-minted browser token (mirrors realtime-auth.ts). */
  export function verifyToken(token: string | null | undefined): {
    kbId: string;
    orgId: string;
  } | null;

  /** BCP-47 language code for the Scribe realtime query (blank → null). */
  export function scribeLanguageCode(language: string | null | undefined): string | null;

  /** Map a vendor Scribe realtime event to the browser frame contract. */
  export function translateScribeEvent(
    event: Record<string, unknown>,
  ): { type: string; [key: string]: unknown } | null;

  /** Build the upstream Scribe realtime URL with documented query params. */
  export function scribeRealtimeUrl(cfg: {
    baseUrl?: string;
    sttModel?: string;
    languageCode?: string | null;
  }): string;

  /** Build the upstream TTS stream-input URL (voice pinned in the path). */
  export function ttsStreamInputUrl(cfg: {
    baseUrl?: string;
    tts?: { model?: string; voiceId?: string };
  }): string;

  /** The BOS message for the TTS leg (space + voice settings + schedule). */
  export function ttsBosMessage(): string;
}
