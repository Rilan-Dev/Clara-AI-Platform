/**
 * Unit tests for the voice-core model catalogue — the voice-axis mirror of
 * ai-core/model-catalog.test.ts.
 *
 * Covers: TTS model catalogue validation, voice-id
 * shape checks, provider union guards, and request caps.
 */

import { describe, expect, it } from "vitest";
import {
  isSupportedTTSModel,
  looksLikeElevenLabsVoiceId,
  getElevenLabsBaseUrl,
  getPlatformDefaultTTSModel,
  getPlatformDefaultSTTModel,
  TTS_MAX_CHARS_PER_REQUEST,
  STT_MAX_AUDIO_SECONDS,
  isSupportedSarvamTTSModel,
  isSupportedSarvamSTTModel,
  findSarvamTTSModel,
  findSarvamSpeaker,
  isSupportedSarvamSpeaker,
  looksLikeSarvamSpeaker,
  isSarvamEnabled,
  getSarvamBaseUrl,
  getSarvamTimeoutMs,
  getPlatformDefaultSarvamTTSModel,
  getPlatformDefaultSarvamSttModel,
  getPlatformDefaultSarvamRealtimeSttModel,
  getPlatformDefaultSarvamRealtimeLlmModel,
  isSarvamRealtimeTtsEnabled,
  getPlatformDefaultSarvamSpeaker,
  getSarvamInrToUsd,
  SARVAM_TTS_MODELS,
  SARVAM_STT_MODELS,
  SARVAM_TTS_LANGUAGES,
  SARVAM_STT_LANGUAGES,
  SARVAM_SPEAKERS,
  SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS,
  SARVAM_STT_MAX_AUDIO_SECONDS,
  SARVAM_TTS_VENDOR_MAX_CHARS,
  SARVAM_TTS_MAX_CHARS,
  SARVAM_PREVIEW_MAX_CHARS,
  SARVAM_TTS_SAMPLE_RATE_HZ,
  toSarvamRealtimeSttModel,
  SARVAM_REALTIME_STT_MODEL_IDS,
  SARVAM_REALTIME_STT_MODEL_FALLBACK,
} from "./model-catalog";
import { isVoiceProvider } from "./types";

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

// ─── Sarvam static catalogue (V0 foundations — Doc/SARVAM_AI_INTEGRATION_PLAN.md) ──

describe("Sarvam TTS model catalogue (V0)", () => {
  it("accepts the canonical Bulbul model ids and rejects unknown ids", () => {
    expect(isSupportedSarvamTTSModel("bulbul:v3")).toBe(true);
    expect(isSupportedSarvamTTSModel("bulbul:v2")).toBe(true);
    expect(isSupportedSarvamTTSModel("bulbul:v4")).toBe(false);
    expect(isSupportedSarvamTTSModel("eleven_flash_v2_5")).toBe(false);
  });

  it("marks bulbul:v2 as legacy with the v3 price point", () => {
    const v3 = findSarvamTTSModel("bulbul:v3");
    const v2 = findSarvamTTSModel("bulbul:v2");
    expect(v3?.usdPer1kChars).toBe(0.036);           // ₹30/10K chars @ 0.012
    expect(v2?.legacy).toBe(true);
    expect(v2?.usdPer1kChars).toBe(v3?.usdPer1kChars);
  });

  it("carries the vendor 2500-char REST cap", () => {
    for (const model of SARVAM_TTS_MODELS) {
      expect(model.maxCharactersPerRequest, model.modelId).toBe(2_500);
    }
  });

  it("lists the 11 Bulbul languages as BCP-47 codes", () => {
    expect(SARVAM_TTS_LANGUAGES).toHaveLength(11);
    expect(SARVAM_TTS_LANGUAGES).toContain("hi-IN");
    expect(SARVAM_TTS_LANGUAGES).toContain("en-IN");
    for (const code of SARVAM_TTS_LANGUAGES) {
      expect(code, code).toMatch(/^[a-z]{2,3}-IN$/);
    }
  });
});

describe("Sarvam STT model catalogue (V0)", () => {
  it("accepts the canonical Saaras model ids", () => {
    expect(isSupportedSarvamSTTModel("saaras:v3")).toBe(true);
    expect(isSupportedSarvamSTTModel("saaras:v4")).toBe(true);
    expect(isSupportedSarvamSTTModel("saaras:v2")).toBe(false);
    expect(isSupportedSarvamSTTModel("scribe_v1")).toBe(false);
  });

  it("prices STT at the converted ₹30/hour rate and caps REST audio at 30s", () => {
    for (const model of SARVAM_STT_MODELS) {
      expect(model.usdPerMinute, model.modelId).toBe(0.006);       // $0.36/h ÷ 60
      expect(model.maxAudioSecondsPerRequest, model.modelId).toBe(30);
      expect(model.autoDetectLanguage).toBe(true);
    }
  });

  it("lists the 23 Saaras languages as BCP-47 codes", () => {
    expect(SARVAM_STT_LANGUAGES).toHaveLength(23);
    expect(SARVAM_STT_LANGUAGES).toContain("hi-IN");
    expect(SARVAM_STT_LANGUAGES).toContain("en-IN");
  });
});

describe("Saaras realtime model mapping (V5 relay)", () => {
  it("maps the batch REST id saaras:v3 to the realtime variant", () => {
    // Production incident 2026-09-20: the relay passed the resolved batch id
    // straight into /speech-to-text-realtime/ws and the vendor answered
    // "Invalid model 'saaras:v3'. Only 'saaras:v3-realtime' and 'saaras:v4'
    // are supported." with fatal=true.
    expect(toSarvamRealtimeSttModel("saaras:v3")).toBe("saaras:v3-realtime");
  });

  it("keeps the realtime-capable saaras:v4 untouched", () => {
    expect(toSarvamRealtimeSttModel("saaras:v4")).toBe("saaras:v4");
  });

  it("is idempotent for already-realtime ids", () => {
    expect(toSarvamRealtimeSttModel("saaras:v3-realtime")).toBe("saaras:v3-realtime");
  });

  it("falls back to saaras:v3-realtime for unknown or blank ids", () => {
    expect(toSarvamRealtimeSttModel("saaras:v2")).toBe("saaras:v3-realtime");
    expect(toSarvamRealtimeSttModel("scribe_v1")).toBe("saaras:v3-realtime");
    expect(toSarvamRealtimeSttModel("")).toBe("saaras:v3-realtime");
    expect(toSarvamRealtimeSttModel("   ")).toBe("saaras:v3-realtime");
  });

  it("trims surrounding whitespace", () => {
    expect(toSarvamRealtimeSttModel("  saaras:v3  ")).toBe("saaras:v3-realtime");
    expect(toSarvamRealtimeSttModel("\tsaaras:v4\n")).toBe("saaras:v4");
  });

  it("maps EVERY catalogued STT id to a vendor-supported realtime id", () => {
    // Contract guard: if a new batch model joins SARVAM_STT_MODELS, its
    // realtime translation must land inside the vendor allow-list.
    expect(SARVAM_STT_MODELS.length).toBeGreaterThan(0);
    for (const model of SARVAM_STT_MODELS) {
      expect(
        SARVAM_REALTIME_STT_MODEL_IDS,
        model.modelId,
      ).toContain(toSarvamRealtimeSttModel(model.modelId));
    }
    expect(SARVAM_REALTIME_STT_MODEL_FALLBACK).toBe("saaras:v3-realtime");
  });
});

describe("Sarvam speaker catalogue (V0)", () => {
  it("catalogues the 37 vendor speakers with unique ids", () => {
    expect(SARVAM_SPEAKERS).toHaveLength(37);
    const ids = new Set(SARVAM_SPEAKERS.map((s) => s.id));
    expect(ids.size).toBe(37);
  });

  it("marks shubh as the default speaker", () => {
    const defaults = SARVAM_SPEAKERS.filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe("shubh");
  });

  it("resolves speakers case-insensitively and rejects unknown ids", () => {
    expect(findSarvamSpeaker("priya")?.gender).toBe("female");
    expect(findSarvamSpeaker("  Shubh  ")?.id).toBe("shubh");
    expect(findSarvamSpeaker("clara")).toBeUndefined();
    expect(isSupportedSarvamSpeaker("aditya")).toBe(true);
    expect(isSupportedSarvamSpeaker("junk")).toBe(false);
  });

  it("validates speaker id shape without hitting the catalogue", () => {
    expect(looksLikeSarvamSpeaker("shubh")).toBe(true);
    expect(looksLikeSarvamSpeaker("Priya")).toBe(true);        // normalized lowercase
    expect(looksLikeSarvamSpeaker("elevenlabsslug12345")).toBe(false); // too long
    expect(looksLikeSarvamSpeaker("a")).toBe(false);           // too short
    expect(looksLikeSarvamSpeaker("bulbul:v3")).toBe(false);   // not a speaker shape
  });
});

describe("Sarvam request caps (V0)", () => {
  it("keeps the vendor and platform caps aligned with the plan", () => {
    expect(SARVAM_STT_VENDOR_MAX_AUDIO_SECONDS).toBe(30);      // vendor REST
    expect(SARVAM_STT_MAX_AUDIO_SECONDS).toBe(120);            // platform bound
    expect(SARVAM_TTS_VENDOR_MAX_CHARS).toBe(2_500);           // vendor REST
    expect(SARVAM_TTS_MAX_CHARS).toBe(2_000);                  // platform bound
    expect(SARVAM_PREVIEW_MAX_CHARS).toBe(300);
    expect(SARVAM_TTS_SAMPLE_RATE_HZ).toBe(16_000);
  });
});

describe("isSarvamEnabled (kill switch)", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is off by default", () => {
    expect(isSarvamEnabled()).toBe(false);
  });

  it("requires BOTH the flag and the key", () => {
    vi.stubEnv("SARVAM_ENABLED", "true");
    vi.stubEnv("SARVAM_API_KEY", "");
    expect(isSarvamEnabled()).toBe(false);
    vi.stubEnv("SARVAM_API_KEY", "sk-live-key");
    expect(isSarvamEnabled()).toBe(true);
  });

  it("flag alone with key absent stays off", () => {
    delete process.env.SARVAM_API_KEY;
    vi.stubEnv("SARVAM_ENABLED", "true");
    expect(isSarvamEnabled()).toBe(false);
  });
});

describe("Sarvam connection settings and defaults (V0)", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("defaults the base URL, timeout and models", () => {
    expect(getSarvamBaseUrl()).toBe("https://api.sarvam.ai");
    expect(getSarvamTimeoutMs()).toBe(30_000);
    expect(getPlatformDefaultSarvamTTSModel()).toBe("bulbul:v3");
    expect(getPlatformDefaultSarvamSttModel()).toBe("saaras:v3");
    expect(getPlatformDefaultSarvamRealtimeSttModel()).toBe("saaras:v3-realtime");
    expect(getPlatformDefaultSarvamRealtimeLlmModel()).toBe("sarvam-105b-conversations");
    expect(isSarvamRealtimeTtsEnabled()).toBe(true);
    expect(getPlatformDefaultSarvamSpeaker()).toBe("shubh");
    expect(getSarvamInrToUsd()).toBe(0.012);
  });

  it("honours env overrides and strips trailing slashes from the base URL", () => {
    vi.stubEnv("SARVAM_BASE_URL", "https://sarvam.example.com/");
    vi.stubEnv("SARVAM_TIMEOUT_MS", "90000");
    vi.stubEnv("SARVAM_TTS_MODEL", "bulbul:v2");
    vi.stubEnv("SARVAM_STT_MODEL", "saaras:v4");
    vi.stubEnv("SARVAM_DEFAULT_SPEAKER", "priya");
    vi.stubEnv("SARVAM_INR_TO_USD", "0.011");
    expect(getSarvamBaseUrl()).toBe("https://sarvam.example.com");
    expect(getSarvamTimeoutMs()).toBe(90_000);
    expect(getPlatformDefaultSarvamTTSModel()).toBe("bulbul:v2");
    expect(getPlatformDefaultSarvamSttModel()).toBe("saaras:v4");
    expect(getPlatformDefaultSarvamSpeaker()).toBe("priya");
    expect(getSarvamInrToUsd()).toBe(0.011);
  });

  it("falls back to safe defaults on malformed env values", () => {
    vi.stubEnv("SARVAM_TIMEOUT_MS", "not-a-number");
    vi.stubEnv("SARVAM_INR_TO_USD", "-3");
    expect(getSarvamTimeoutMs()).toBe(30_000);
    expect(getSarvamInrToUsd()).toBe(0.012);
  });

  // Regression (2026-09-19 production incident): a platform-settings save of
  // a blank Base URL field left SARVAM_BASE_URL set-but-empty, and the old
  // `??` fallback kept "" — every Sarvam URL collapsed to a bare path and
  // failed with "Failed to parse URL from /text-to-speech" (chat, TTS, STT
  // and realtime alike). Set-but-empty must mean "unset".
  it("treats a set-but-EMPTY SARVAM_BASE_URL as unset (panel blank-save regression)", () => {
    vi.stubEnv("SARVAM_BASE_URL", "");
    expect(getSarvamBaseUrl()).toBe("https://api.sarvam.ai");
  });

  it("treats a whitespace-only SARVAM_BASE_URL as unset", () => {
    vi.stubEnv("SARVAM_BASE_URL", "   ");
    expect(getSarvamBaseUrl()).toBe("https://api.sarvam.ai");
  });

  it("treats a set-but-EMPTY ELEVENLABS_API_BASE_URL as unset (same class of bug)", () => {
    vi.stubEnv("ELEVENLABS_API_BASE_URL", "");
    expect(getElevenLabsBaseUrl()).toBe("https://api.elevenlabs.io");
  });
});
