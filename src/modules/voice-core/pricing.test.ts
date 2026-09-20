/**
 * Unit tests for the voice-core unit-cost model (pricing.ts).
 *
 * Costs must derive from measured facts (characters / audio-seconds) at the
 * catalogue's per-model rates, with env overrides honoured.
 */

import { describe, expect, it } from "vitest";
import {
  ttsCostUsdMicros,
  sttCostUsdMicros,
  conversationCostUsdMicros,
  ttsUsdPer1kChars,
} from "./pricing";

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
