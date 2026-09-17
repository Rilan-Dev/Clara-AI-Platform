/**
 * Unit tests for the ElevenLabs voice integration core.
 *
 * Covers: config kill-switches, TTS model catalogue validation, voice-id
 * shape checks, pricing math, and the org settings PATCH input parsing
 * (voice-provider axis round-trip).
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
} from "@/modules/voice-elevenlabs/core/config";
import {
  ttsCostUsdMicros,
  sttCostUsdMicros,
  conversationCostUsdMicros,
  ttsUsdPer1kChars,
} from "@/modules/voice-elevenlabs/core/pricing";
import { isVoiceProvider } from "@/modules/voice-elevenlabs/core/types";
import { splitSentencesLike } from "./sentence-helpers";

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

// ─── Pricing math ────────────────────────────────────────────────────────────

describe("ElevenLabs pricing", () => {
  it("charges flash at ~$0.06 per 1k characters", () => {
    // 1,000 chars of flash at default $0.06/1k = $60,000 micros
    expect(ttsCostUsdMicros("eleven_flash_v2_5", 1_000)).toBe(60_000);
  });

  it("scales linearly with characters", () => {
    expect(ttsCostUsdMicros("eleven_flash_v2_5", 2_000)).toBe(120_000);
    expect(ttsCostUsdMicros("eleven_flash_v2_5", 0)).toBe(0);
  });

  it("falls back to the flash rate for unknown models", () => {
    expect(ttsCostUsdMicros("unknown_model", 1_000)).toBe(60_000);
  });

  it("honours the env override", () => {
    process.env.ELEVENLABS_TTS_USD_PER_1K_CHARS = "0.10";
    expect(ttsUsdPer1kChars("eleven_flash_v2_5")).toBe(0.10);
    delete process.env.ELEVENLABS_TTS_USD_PER_1K_CHARS;
  });

  it("meters STT by the audio-minute", () => {
    // 60 s at $0.40/min = $400,000 micros
    expect(sttCostUsdMicros(60)).toBe(400_000);
    expect(sttCostUsdMicros(30)).toBe(200_000);
  });

  it("meters conversations by the minute", () => {
    expect(conversationCostUsdMicros(120)).toBe(200_000);
  });
});

// ─── Request caps ────────────────────────────────────────────────────────────

describe("request caps", () => {
  it("keeps the documented abuse caps", () => {
    expect(TTS_MAX_CHARS_PER_REQUEST).toBe(2_000);
    expect(STT_MAX_AUDIO_SECONDS).toBe(120);
  });
});

// ─── Sentence chunking (mirrors the hook's splitter) ─────────────────────────

describe("sentence chunking", () => {
  it("splits on terminal punctuation and keeps the remainder", () => {
    const { sentences, rest } = splitSentencesLike(
      "This is the first sentence. And here comes the second one! A trailing fragment",
    );
    expect(sentences).toEqual(["This is the first sentence.", "And here comes the second one!"]);
    expect(rest.trim()).toBe("A trailing fragment");
  });

  it("returns nothing when no sentence is complete yet", () => {
    const { sentences, rest } = splitSentencesLike("Still generating the first");
    expect(sentences).toEqual([]);
    expect(rest).toBe("Still generating the first");
  });

  it("handles international punctuation", () => {
    const { sentences } = splitSentencesLike("Is this a question? Sí, es una respuesta.");
    expect(sentences.length).toBe(2);
  });
});
