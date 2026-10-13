/**
 * src/modules/voice-core/api/realtime-channels.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Contract tests for the shared realtime channel resolver
 * (scripts/realtime-channels.mjs) — the ONE routing table used by BOTH
 * WebSocket front doors:
 *
 *   • api/voice-realtime.mjs     (Vercel WebSocket Function)
 *   • scripts/start.mjs          (standalone / docker relay)
 *
 * Regression background (2026-10-13): the ElevenLabs clara-stream session
 * descriptor points browsers at /api/voice-realtime?channel=elevenlabs-stt,
 * but the standalone relay only routed the legacy per-purpose paths — every
 * channel upgrade 404'd at the handshake and realtime voice sessions could
 * never start. These tests pin the resolver so the two front doors can never
 * drift apart again.
 */

import { describe, expect, it } from "vitest";
import {
  REALTIME_CHANNELS,
  resolveRealtimeChannel,
} from "../../../../scripts/realtime-channels.mjs";

const params = (query: string) => new URLSearchParams(query);

describe("resolveRealtimeChannel — channel query style (Vercel function)", () => {
  it("resolves every canonical channel from ?channel=", () => {
    for (const channel of REALTIME_CHANNELS) {
      expect(resolveRealtimeChannel("/api/voice-realtime", params(`channel=${channel}`)))
        .toEqual({ kind: "channel", channel });
    }
  });

  it("resolves the ElevenLabs STT channel the session descriptor emits", () => {
    // Exactly what /api/voice/elevenlabs/session returns as stt.realtime.endpoint
    expect(resolveRealtimeChannel("/api/voice-realtime", params("channel=elevenlabs-stt")))
      .toEqual({ kind: "channel", channel: "elevenlabs-stt" });
  });

  it("resolves the ElevenLabs TTS channel the session descriptor emits", () => {
    expect(resolveRealtimeChannel("/api/voice-realtime", params("channel=elevenlabs-tts")))
      .toEqual({ kind: "channel", channel: "elevenlabs-tts" });
  });

  it("marks a missing or invalid channel as unknown (→ 404 / close 1008)", () => {
    expect(resolveRealtimeChannel("/api/voice-realtime", params(""))).toEqual({ kind: "unknown" });
    expect(resolveRealtimeChannel("/api/voice-realtime", null)).toEqual({ kind: "unknown" });
    expect(resolveRealtimeChannel("/api/voice-realtime", params("channel=tracer")))
      .toEqual({ kind: "unknown" });
  });
});

describe("resolveRealtimeChannel — sub-path style (legacy rewrite)", () => {
  it("resolves /api/voice-realtime/<channel> for every channel", () => {
    for (const channel of REALTIME_CHANNELS) {
      expect(resolveRealtimeChannel(`/api/voice-realtime/${channel}`, undefined))
        .toEqual({ kind: "channel", channel });
    }
  });

  it("reserves the speech-engine sub-path for the ElevenLabs SDK listener", () => {
    expect(resolveRealtimeChannel("/api/voice-realtime/speech-engine", undefined))
      .toEqual({ kind: "speech-engine" });
  });

  it("rejects nested or invalid sub-paths as unknown", () => {
    expect(resolveRealtimeChannel("/api/voice-realtime/a/b", undefined))
      .toEqual({ kind: "unknown" });
    expect(resolveRealtimeChannel("/api/voice-realtime/nope", undefined))
      .toEqual({ kind: "unknown" });
  });
});

describe("resolveRealtimeChannel — non-front-door paths", () => {
  it("returns none so the caller falls through to its legacy table", () => {
    for (const pathname of [
      "/api/embed/voice",
      "/api/voice/elevenlabs/realtime",
      "/api/voice/elevenlabs/tts-realtime",
      "/api/voice/sarvam/realtime",
      "/api/voice/sarvam/tts-realtime",
      "/api/voice/gemini/realtime",
      "/api/voice/elevenlabs/speech-engine",
      "/api/chat",
      "/",
    ]) {
      expect(resolveRealtimeChannel(pathname, undefined)).toEqual({ kind: "none" });
    }
  });

  it("tolerates a non-string pathname defensively", () => {
    expect(resolveRealtimeChannel(undefined as unknown as string, undefined))
      .toEqual({ kind: "none" });
  });
});

describe("REALTIME_CHANNELS contract", () => {
  it("covers every relay the standalone start.mjs routes", () => {
    // channelWss keys in scripts/start.mjs must all appear here — keeping
    // this list explicit makes a missing entry fail loudly in review.
    expect([...REALTIME_CHANNELS].sort()).toEqual([
      "elevenlabs-stt",
      "elevenlabs-tts",
      "embed",
      "gemini",
      "sarvam",
      "sarvam-tts",
      "twilio",
      "vonage",
    ]);
  });
});
