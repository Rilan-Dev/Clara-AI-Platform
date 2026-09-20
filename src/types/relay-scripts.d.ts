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
