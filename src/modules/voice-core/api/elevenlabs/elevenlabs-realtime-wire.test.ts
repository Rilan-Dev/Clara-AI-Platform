/**
 * Plan Tasks 6.2 + 6.3 — ElevenLabs Clara-realtime adapters.
 *
 * Scribe realtime STT (Task 6.2): the relay maps documented vendor events
 * (session_started / partial_transcript / committed_transcript / errors) to
 * the browser frame contract; ONLY a committed transcript becomes a
 * transcript_final frame (the sole event allowed to create a Clara turn).
 *
 * Streaming TTS WebSocket (Task 6.3): the relay builds the vendor URL with
 * the pinned pcm_16000 output format and the documented BOS message; the
 * flush frame NEVER sends an empty text ("" closes the vendor socket).
 *
 * Session-token discipline mirrors the Sarvam relay (HMAC, expiry).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  scribeLanguageCode,
  scribeRealtimeUrl,
  translateScribeEvent,
  ttsBosMessage,
  ttsStreamInputUrl,
  verifyToken,
} from "../../../../../scripts/elevenlabs-relay.mjs";
import {
  isElevenLabsRelayRequest,
  mintElevenLabsRealtimeToken,
  verifyElevenLabsRealtimeToken,
} from "./realtime-auth";

beforeEach(() => {
  process.env.AUTH_SECRET = "x".repeat(48);
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe("translateScribeEvent — documented vendor events → browser frames", () => {
  it("maps session_started", () => {
    expect(translateScribeEvent({ type: "session_started" })).toEqual({
      type: "session_started",
    });
  });

  it("maps partial_transcript to transcript_partial (live captions only)", () => {
    expect(translateScribeEvent({ type: "partial_transcript", text: "hel" })).toEqual({
      type: "transcript_partial",
      text: "hel",
    });
  });

  it("maps committed_transcript to transcript_final — the ONLY turn-creating event", () => {
    expect(translateScribeEvent({ type: "committed_transcript", text: "hello there" })).toEqual({
      type: "transcript_final",
      text: "hello there",
    });
  });

  it("collapses the committed_transcript variants into one final frame", () => {
    // The _with_timestamps / _entities variants repeat the same committed
    // text — each maps to a final frame; the hook's duplicate-commit guard
    // (same text within 2 s) absorbs the repeats.
    expect(
      translateScribeEvent({ type: "committed_transcript_with_timestamps", text: "hi", words: [] }),
    ).toEqual({ type: "transcript_final", text: "hi" });
    expect(
      translateScribeEvent({ type: "committed_transcript_entities", text: "hi", entities: [] }),
    ).toEqual({ type: "transcript_final", text: "hi" });
  });

  it("maps error envelopes as fatal errors", () => {
    expect(translateScribeEvent({ type: "error", message: "quota_exceeded" })).toEqual({
      type: "error",
      message: "quota_exceeded",
      fatal: true,
    });
    expect(
      translateScribeEvent({ error: { type: "auth_error", message: "bad key" } }),
    ).toEqual({ type: "error", message: "bad key", fatal: true });
  });

  it("passes unknown typed events through; swallows non-typed frames", () => {
    const unknown = { type: "future.event", payload: 1 };
    expect(translateScribeEvent(unknown)).toEqual({ type: "upstream", event: unknown });
    expect(translateScribeEvent({ something: "else" })).toBeNull();
  });
});

describe("scribeRealtimeUrl — documented connection parameters", () => {
  it("builds the vendor URL with model, audio format and language", () => {
    const url = scribeRealtimeUrl({
      baseUrl: "https://api.elevenlabs.io",
      sttModel: "scribe_v2_realtime",
      languageCode: "en",
    });
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/speech-to-text/realtime" +
        "?model_id=scribe_v2_realtime&audio_format=pcm_16000&language_code=en",
    );
  });

  it("omits language_code when blank and defaults the model", () => {
    const url = scribeRealtimeUrl({ baseUrl: "https://api.elevenlabs.io/" });
    expect(url).toContain("model_id=scribe_v2_realtime");
    expect(url).toContain("audio_format=pcm_16000");
    expect(url).not.toContain("language_code");
    expect(url).toContain("elevenlabs.io/v1/speech-to-text/realtime?");
  });

  it("scribes BCP-47 language codes pass through, blanks are null", () => {
    expect(scribeLanguageCode("en")).toBe("en");
    expect(scribeLanguageCode(" ta ")).toBe("ta");
    expect(scribeLanguageCode(null)).toBeNull();
    expect(scribeLanguageCode("")).toBeNull();
  });
});

describe("ttsStreamInputUrl + BOS — streaming TTS contract (Task 6.3)", () => {
  it("pins the voice in the path, the model and pcm_16000 output format", () => {
    const url = ttsStreamInputUrl({
      baseUrl: "https://api.elevenlabs.io",
      tts: { model: "eleven_flash_v2_5", voiceId: "Xb7hH8MSUJpSbSDYk0k2" },
    });
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/Xb7hH8MSUJpSbSDYk0k2/stream-input" +
        "?model_id=eleven_flash_v2_5&output_format=pcm_16000",
    );
  });

  it("BOS message carries the documented init shape (space + settings + schedule)", () => {
    const bos = JSON.parse(ttsBosMessage());
    expect(bos.text).toBe(" ");
    expect(bos.voice_settings).toEqual({
      stability: 0.5,
      similarity_boost: 0.8,
      use_speaker_boost: false,
    });
    expect(Array.isArray(bos.generation_config.chunk_length_schedule)).toBe(true);
    expect(bos.generation_config.chunk_length_schedule).toEqual([50, 120, 160, 290]);
  });
});

describe("ElevenLabs realtime session tokens (mirror of Sarvam V5 discipline)", () => {
  it("mint → verify round-trip with claims", () => {
    const token = mintElevenLabsRealtimeToken({ kbId: "kb-1", orgId: "org-1" });
    const claims = verifyElevenLabsRealtimeToken(token);
    expect(claims).toMatchObject({ kbId: "kb-1", orgId: "org-1" });
    // The plain-JS relay verifier accepts the same token.
    expect(verifyToken(token)).toMatchObject({ kbId: "kb-1", orgId: "org-1" });
  });

  it("rejects tampered, malformed and expired tokens (TS + relay verifiers)", () => {
    const token = mintElevenLabsRealtimeToken({ kbId: "kb-1", orgId: "org-1" });
    const tampered = `${token.slice(0, -2)}ff`;
    expect(verifyElevenLabsRealtimeToken(tampered)).toBeNull();
    expect(verifyToken(tampered)).toBeNull();
    expect(verifyElevenLabsRealtimeToken("garbage")).toBeNull();
    expect(verifyToken("garbage")).toBeNull();

    const expired = mintElevenLabsRealtimeToken({ kbId: "kb-1", orgId: "org-1", ttlMs: -1 });
    expect(verifyElevenLabsRealtimeToken(expired)).toBeNull();
    expect(verifyToken(expired)).toBeNull();
  });

  it("the relay-header HMAC authenticates in-process relay calls", () => {
    expect(isElevenLabsRelayRequest(null)).toBe(false);
    expect(isElevenLabsRelayRequest("not-a-hmac")).toBe(false);
  });
});
