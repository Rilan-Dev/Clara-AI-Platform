/**
 * Plan Task 5.2 — Sarvam realtime STT wire protocol alignment.
 *
 * The relay (scripts/sarvam-relay.mjs) now exposes its pure mapping helpers so
 * the browser frame contract is unit-locked against the CURRENT documented
 * vendor protocol (docs.sarvam.ai, August 2026 realtime streaming guide):
 *
 *   server→client: session.begin, vad.speech_start / vad.speech_end,
 *                  transcript.partial, transcript.final, config.updated,
 *                  pong, session.end (audio_duration_s), error
 *   close codes:   1003 rate-limit/invalid key · 1008 inactivity ·
 *                  1011 internal · 4000 invalid model/language/parameter
 *
 * The vendor docs explicitly recommend driving barge-in off
 * `vad.speech_start` rather than `transcript.final` — the relay forwards it
 * first-class and useSarvamVoice interrupts playback on it.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeRealtimeLanguage,
  toRealtimeModel,
  transcriptText,
  translateUpstreamEvent,
} from "../../../../../scripts/sarvam-relay.mjs";

describe("toRealtimeModel — documented realtime model ids", () => {
  it("accepts exactly the documented ids and translates everything else", () => {
    // docs.sarvam.ai: model = saaras:v3-realtime (default) or saaras:v4.
    expect(toRealtimeModel("saaras:v3-realtime")).toBe("saaras:v3-realtime");
    expect(toRealtimeModel("saaras:v4")).toBe("saaras:v4");
    // Batch REST id → realtime variant (the historical production failure).
    expect(toRealtimeModel("saaras:v3")).toBe("saaras:v3-realtime");
    // Unknown/blank → default.
    expect(toRealtimeModel("saaras:v2")).toBe("saaras:v3-realtime");
    expect(toRealtimeModel("")).toBe("saaras:v3-realtime");
    expect(toRealtimeModel(undefined)).toBe("saaras:v3-realtime");
  });
});

describe("normalizeRealtimeLanguage — documented language codes", () => {
  it("maps the retired Odia code to this endpoint's code", () => {
    // Legacy streaming API used od-IN; this endpoint uses or-IN.
    expect(normalizeRealtimeLanguage("od-IN")).toBe("or-IN");
    expect(normalizeRealtimeLanguage("or-IN")).toBe("or-IN");
  });

  it("passes valid codes through and defaults blanks to en-IN", () => {
    expect(normalizeRealtimeLanguage("ta-IN")).toBe("ta-IN");
    expect(normalizeRealtimeLanguage("hi-IN")).toBe("hi-IN");
    expect(normalizeRealtimeLanguage("auto")).toBe("auto");
    expect(normalizeRealtimeLanguage("")).toBe("en-IN");
    expect(normalizeRealtimeLanguage(null)).toBe("en-IN");
  });
});

describe("translateUpstreamEvent — browser frame contract", () => {
  it("maps transcript partials and finals (both envelope variants)", () => {
    expect(translateUpstreamEvent({ event: "transcript.partial", text: "hel" })).toEqual({
      type: "transcript_partial",
      text: "hel",
    });
    expect(translateUpstreamEvent({ type: "transcript.partial", partial: "hel" })).toEqual({
      type: "transcript_partial",
      text: "hel",
    });
    expect(
      translateUpstreamEvent({ event: "transcript.final", transcript: "hello there" }),
    ).toEqual({ type: "transcript_final", text: "hello there" });
    expect(translateUpstreamEvent({ type: "transcript_final", text: "hi" })).toEqual({
      type: "transcript_final",
      text: "hi",
    });
  });

  it("forwards VAD speech boundaries first-class (documented barge-in trigger)", () => {
    expect(translateUpstreamEvent({ event: "vad.speech_start" })).toEqual({
      type: "vad_speech_start",
    });
    expect(translateUpstreamEvent({ event: "vad.speech_end" })).toEqual({
      type: "vad_speech_end",
    });
  });

  it("forwards session.end with the server-authoritative billed audio", () => {
    expect(translateUpstreamEvent({ event: "session.end", audio_duration_s: 42.7 })).toEqual({
      type: "session_end",
      audioDurationS: 42.7,
    });
    // Missing / invalid duration → null, not NaN.
    expect(translateUpstreamEvent({ event: "session.end" })).toEqual({
      type: "session_end",
      audioDurationS: null,
    });
  });

  it("swallows session.begin and pong (noise)", () => {
    expect(translateUpstreamEvent({ event: "session.begin" })).toBeNull();
    expect(translateUpstreamEvent({ event: "pong" })).toBeNull();
  });

  it("maps vendor errors with the fatal flag", () => {
    expect(
      translateUpstreamEvent({ type: "error", code: "rate_limited", message: "slow down" }),
    ).toEqual({ type: "error", message: "slow down", fatal: false });
    expect(
      translateUpstreamEvent({ type: "error", is_fatal: true, message: "Invalid model" }),
    ).toEqual({ type: "error", message: "Invalid model", fatal: true });
  });

  it("passes unknown vendor events through with the envelope intact", () => {
    const unknown = { event: "future.event", payload: { x: 1 } };
    expect(translateUpstreamEvent(unknown)).toEqual({ type: "upstream", event: unknown });
  });

  it("extracts transcript text tolerantly", () => {
    expect(transcriptText({ transcript: "a" })).toBe("a");
    expect(transcriptText({ text: "b" })).toBe("b");
    expect(transcriptText({ partial: "c" })).toBe("c");
    expect(transcriptText({})).toBe("");
  });
});
