/**
 * src/modules/assistant/core/voice/mic-mute.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared microphone mute ("pause") helper for every voice surface.
 *
 * Muting toggles `MediaStreamTrack.enabled` on the LOCAL microphone stream:
 *   - enabled = false  → the track outputs digital silence. WebRTC peers,
 *     AudioWorklet/ScriptProcessor capture graphs and MediaRecorders all keep
 *     running (the session stays alive), but no real audio ever leaves the
 *     browser: server-side VAD stops firing, STT receives silence, barge-in
 *     can no longer trigger.
 *   - enabled = true   → live audio resumes immediately (no renegotiation,
 *     no new getUserMedia permission prompt).
 *
 * This is the "pause/resume the mic" semantic requested for embed voice-chat
 * and realtime sessions: the conversation stays connected while the visitor's
 * microphone is temporarily held.
 *
 * Mute is privacy-safe by construction across provider transports:
 *   OpenAI Realtime (WebRTC track), Gemini Live (WebRTC track),
 *   Sarvam realtime (AudioWorklet/ScriptProcessor PCM frames → WS),
 *   ElevenLabs Mode A (MediaRecorder webm/opus utterances),
 *   ElevenLabs Mode B (ConvAI SDK capture),
 *   ElevenLabs Mode C (AudioWorklet PCM → Scribe WS).
 * Every transport reads from the SAME mic MediaStream, so silencing the
 * track silences them all.
 */

/**
 * Set the mute state on every live audio track of a mic stream.
 *
 * @returns true when the stream had at least one live (non-ended) audio
 *   track that the call could act on — callers use this to distinguish
 *   "muted the mic" from "no mic yet" (e.g. before connect() completes).
 */
export function setMicStreamMuted(
  stream: MediaStream | null | undefined,
  muted: boolean,
): boolean {
  if (!stream || typeof stream.getAudioTracks !== "function") return false;
  const tracks = stream.getAudioTracks();
  let live = 0;
  for (const track of tracks) {
    if (track.readyState === "ended") continue;
    live += 1;
    // Only touch tracks that actually change state so repeat calls stay
    // idempotent (and never fire a track "unmute" event spuriously).
    if (track.enabled !== !muted) {
      track.enabled = !muted;
    }
  }
  return live > 0;
}

/**
 * Read-back helper (for UI state hydration after reconnects): a stream is
 * considered muted when it has at least one live audio track and ALL live
 * audio tracks are disabled.
 */
export function isMicStreamMuted(
  stream: MediaStream | null | undefined,
): boolean {
  if (!stream || typeof stream.getAudioTracks !== "function") return false;
  const tracks = stream.getAudioTracks().filter((t) => t.readyState !== "ended");
  return tracks.length > 0 && tracks.every((t) => !t.enabled);
}
