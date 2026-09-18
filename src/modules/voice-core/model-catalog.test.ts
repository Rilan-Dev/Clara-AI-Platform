/**
 * Unit tests for the voice-core model catalogue — the voice-axis mirror of
 * ai-core/model-catalog.test.ts.
 *
 * Covers: kill-switch semantics, TTS model catalogue validation, voice-id
 * shape checks, provider union guards, and request caps.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isSupportedTTSModel,
  looksLikeElevenLabsVoiceId,
  isElevenLabsEnabled,
  getPlatformDefaultTTSModel,
  getPlatformDefaultSTTModel,
  TTS_MAX_CHARS_PER_REQUEST,
  STT_MAX_AUDIO_SECONDS,
} from "./model-catalog";
import { isVoiceProvider } from "./types";

// ─── Kill switch ─────────────────────────────────────────────────────────────

describe("isElevenLabsEnabled", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is off by default", () => {
    delete process.env.ELEVENLABS_ENABLED;
    delete process.env.ELEVENLABS_API_KEY;
    expect(isElevenLabsEnabled()).toBe(false);
  });

  it("requires BOTH the flag and the key", () => {
    vi.stubEnv("ELEVENLABS_ENABLED", "true");
    expect(isElevenLabsEnabled()).toBe(false); // no key yet
    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test_key");
    expect(isElevenLabsEnabled()).toBe(true);
  });

  it("flag alone with key absent stays off", () => {
    vi.stubEnv("ELEVENLABS_ENABLED", "true");
    delete process.env.ELEVENLABS_API_KEY;
    expect(isElevenLabsEnabled()).toBe(false);
  });
});

// ─── Model catalogue ─────────────────────────────────────────────────────────

describe("ElevenLabs TTS model catalogue", () => {
  it("accepts the canonical model ids", () => {
    for (const id of ["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_v3"]) {
      expect(isSupportedTTSModel(id)).toBe(true);
    }
  });

  it("rejects unknown model ids", () => {
    expect(isSupportedTTSModel("gpt-4o-mini")).toBe(false);
    expect(isSupportedTTSModel("eleven_does_not_exist")).toBe(false);
    expect(isSupportedTTSModel("")).toBe(false);
  });

  it("defaults to flash for latency", () => {
    delete process.env.ELEVENLABS_DEFAULT_TTS_MODEL;
    expect(getPlatformDefaultTTSModel()).toBe("eleven_flash_v2_5");
    expect(getPlatformDefaultSTTModel()).toBe("scribe_v1");
  });

  it("platform default override wins", () => {
    process.env.ELEVENLABS_DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
    expect(getPlatformDefaultTTSModel()).toBe("eleven_multilingual_v2");
    delete process.env.ELEVENLABS_DEFAULT_TTS_MODEL;
  });
});

// ─── Voice id shape ──────────────────────────────────────────────────────────

describe("looksLikeElevenLabsVoiceId", () => {
  it("accepts 20-char alphanumeric slugs", () => {
    expect(looksLikeElevenLabsVoiceId("JBFqnCBsd6RMkjVDRZzb")).toBe(true);
    expect(looksLikeElevenLabsVoiceId("9BWtsMINqrJLrRacOk9x")).toBe(true);
  });

  it("rejects OpenAI voice names, model ids, and junk", () => {
    expect(looksLikeElevenLabsVoiceId("alloy")).toBe(false);
    expect(looksLikeElevenLabsVoiceId("gpt-realtime-2.1-mini")).toBe(false);
    expect(looksLikeElevenLabsVoiceId("short")).toBe(false);
    expect(looksLikeElevenLabsVoiceId("has spaces in it")).toBe(false);
  });
});

// ─── Voice provider union ────────────────────────────────────────────────────

describe("isVoiceProvider", () => {
  it("accepts the three providers", () => {
    expect(isVoiceProvider("openai")).toBe(true);
    expect(isVoiceProvider("gemini")).toBe(true);
    expect(isVoiceProvider("elevenlabs")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isVoiceProvider("azure")).toBe(false);
    expect(isVoiceProvider(null)).toBe(false);
    expect(isVoiceProvider(1)).toBe(false);
  });
});

// ─── Request caps ────────────────────────────────────────────────────────────

describe("request caps", () => {
  it("keeps the documented abuse caps", () => {
    expect(TTS_MAX_CHARS_PER_REQUEST).toBe(2_000);
    expect(STT_MAX_AUDIO_SECONDS).toBe(120);
  });
});
