/**
 * scripts/realtime-channels.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE routing table for every realtime WebSocket front door.
 *
 * Clara serves realtime WS tunnels through two front doors that must agree:
 *
 *   • Vercel WebSocket Function — api/voice-realtime.mjs (channel comes as a
 *     query parameter: /api/voice-realtime?channel=elevenlabs-stt)
 *   • Standalone / docker deployments — scripts/start.mjs (relay paths were
 *     historically separate: /api/voice/elevenlabs/realtime, …)
 *
 * The ElevenLabs session descriptor (mode "clara-stream") points browsers at
 * the Vercel-style channel URL on EVERY deployment, but start.mjs only knew
 * the legacy paths — so on standalone deployments every
 * /api/voice-realtime?channel=… upgrade fell into the 404 else-branch and
 * realtime voice sessions could never start (browser WebSocket handshake
 * refused with HTTP 404). This module is the shared resolver both front
 * doors now call, so the tables can never drift apart again.
 *
 * Resolved shapes:
 *   { kind: "channel", channel } — route to the channel's WebSocket server
 *   { kind: "speech-engine" }    — leave untouched: the ElevenLabs Speech
 *                                  Engine SDK owns this upgrade itself
 *   { kind: "unknown" }          — a /api/voice-realtime URL with no valid
 *                                  channel → 404 / close 1008
 *   { kind: "none" }             — not a /api/voice-realtime path; the caller
 *                                  falls through to its legacy path table
 */

/** Canonical channel ids, shared by both front doors. */
export const REALTIME_CHANNELS = Object.freeze([
  "embed",
  "twilio",
  "vonage",
  "sarvam",
  "sarvam-tts",
  "elevenlabs-stt",
  "elevenlabs-tts",
  "gemini",
]);

const REALTIME_CHANNEL_SET = new Set(REALTIME_CHANNELS);

const CHANNEL_PREFIX = "/api/voice-realtime/";
export const SPEECH_ENGINE_CHANNEL = "speech-engine";

/**
 * Canonicalize a realtime upgrade request to its channel.
 *
 * @param {string} pathname
 * @param {URLSearchParams | null | undefined} searchParams
 * @returns {{ kind: "channel"; channel: string } | { kind: "speech-engine" } | { kind: "unknown" } | { kind: "none" }}
 */
export function resolveRealtimeChannel(pathname, searchParams) {
  if (typeof pathname !== "string") return { kind: "none" };

  // Vercel WebSocket Functions expose the exact function pathname
  // (/api/voice-realtime) with the channel as a query parameter.
  if (pathname === "/api/voice-realtime") {
    const channel = searchParams?.get("channel") ?? "";
    return REALTIME_CHANNEL_SET.has(channel)
      ? { kind: "channel", channel }
      : { kind: "unknown" };
  }

  // Legacy rewrite style: /api/voice-realtime/<channel> sub-paths.
  if (pathname.startsWith(CHANNEL_PREFIX)) {
    const rest = pathname.slice(CHANNEL_PREFIX.length);
    if (rest === SPEECH_ENGINE_CHANNEL) return { kind: "speech-engine" };
    // Nested garbage (/api/voice-realtime/a/b) is unknown, not a channel.
    if (rest.includes("/")) return { kind: "unknown" };
    return REALTIME_CHANNEL_SET.has(rest)
      ? { kind: "channel", channel: rest }
      : { kind: "unknown" };
  }

  // Not a channel front door — caller applies its own legacy path table.
  return { kind: "none" };
}
