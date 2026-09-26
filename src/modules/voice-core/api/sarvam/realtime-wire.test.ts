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
import {
  audioBytesOf,
  buildRealtimeSttUrl,
  buildTtsConfig,
  realtimeVadTuning,
  toUpstreamSttFrame,
} from "../../../../../scripts/sarvam-wire.mjs";

describe("toRealtimeModel — documented realtime model ids", () => {
  it("accepts exactly the documented ids and translates everything else", () => {
    // docs.sarvam.ai: model = saaras:v3-realtime (default) or saaras:v4.
    expect(toRealtimeModel("saaras:v3-realtime")).toBe("saaras:v3-realtime");
    expect(toRealtimeModel("saaras:v4")).toBe("saaras:v4");
    expect(toRealtimeModel("saaras:v4-realtime")).toBe("saaras:v4-realtime");
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
    // "unknown" is the BATCH auto-detect code; the realtime endpoint's
    // adaptive detection is "auto" (multi-language assistants).
    expect(normalizeRealtimeLanguage("unknown")).toBe("auto");
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

describe("sarvam-wire — shared realtime wire contract", () => {
  it("builds the realtime STT URL with auto detection and configurable VAD", () => {
    const url = new URL(
      buildRealtimeSttUrl({
        baseUrl: "https://api.sarvam.ai/",
        languageCode: "unknown",
        model: "saaras:v3",
        sampleRate: 16000,
        vad: { threshold: 0.4, silenceMs: 700, minSpeechMs: 200 },
      }),
    );
    expect(url.pathname).toBe("/speech-to-text-realtime/ws");
    expect(url.searchParams.get("language_code")).toBe("auto");
    expect(url.searchParams.get("model")).toBe("saaras:v3-realtime");
    expect(url.searchParams.get("sample_rate")).toBe("16000");
    expect(url.searchParams.get("threshold")).toBe("0.4");
    expect(url.searchParams.get("silence_duration_ms")).toBe("700");
    expect(url.searchParams.get("min_speech_duration_ms")).toBe("200");
  });

  it("clamps VAD tuning into sane ranges", () => {
    expect(realtimeVadTuning({ threshold: 5, silenceMs: 1, minSpeechMs: 99999 })).toEqual({
      threshold: 0.95,
      silenceMs: 100,
      minSpeechMs: 2000,
    });
  });

  it("sends the documented TTS config frame (target_language_code + explicit sample rate)", () => {
    const frame = buildTtsConfig({ speaker: "anushka", languageCode: "hi-IN", sampleRate: 24000, pace: 1.1 });
    expect(frame.type).toBe("config");
    expect(frame.data).toMatchObject({
      speaker: "anushka",
      target_language_code: "hi-IN",
      speech_sample_rate: 24000,
      pace: 1.1,
      output_audio_codec: "linear16",
    });
    expect(frame.data).not.toHaveProperty("language_code");
    // TTS needs a concrete language — auto-detect codes fall back to en-IN.
    expect(buildTtsConfig({ languageCode: "auto" }).data.target_language_code).toBe("en-IN");
    // Streaming TTS tops out at 24 kHz.
    expect(buildTtsConfig({ sampleRate: 48000 }).data.speech_sample_rate).toBe(24000);
  });

  it("meters decoded audio bytes, not the base64 JSON frame", () => {
    const pcm = Buffer.alloc(3200, 1); // 100 ms of 16 kHz PCM16
    const frame = JSON.stringify({ event: "audio_input", audio: pcm.toString("base64") });
    expect(audioBytesOf(frame)).toBe(3200);
    expect(frame.length).toBeGreaterThan(4200); // the old (over-billing) count
  });

  it("forwards only audio and keepalives upstream", () => {
    expect(toUpstreamSttFrame(JSON.stringify({ event: "audio_input", audio: "AAA=" }), false)).toBe(
      JSON.stringify({ event: "audio_input", audio: "AAA=" }),
    );
    expect(toUpstreamSttFrame(JSON.stringify({ event: "ping" }), false)).toBe(JSON.stringify({ event: "ping" }));
    // A browser can never reconfigure the vendor session.
    expect(toUpstreamSttFrame(JSON.stringify({ event: "config.update", language_code: "ta-IN" }), false)).toBeNull();
    expect(toUpstreamSttFrame("not json", false)).toBeNull();
    // Raw binary PCM is wrapped as audio_input.
    expect(JSON.parse(toUpstreamSttFrame(Buffer.from([1, 2, 3, 4]), true)!)).toEqual({
      event: "audio_input",
      audio: Buffer.from([1, 2, 3, 4]).toString("base64"),
    });
  });
});
