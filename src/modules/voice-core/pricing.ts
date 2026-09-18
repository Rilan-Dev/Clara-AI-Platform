/**
 * src/modules/voice-core/pricing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit-cost model for voice provider usage, mirroring the per-model price
 * list philosophy of src/modules/ai-core/model-catalog.ts.
 *
 * Costs are computed from usage facts (characters / audio-seconds) reported
 * by the caller, NEVER guessed from the response body. Env overrides let
 * operators pin exact negotiated prices without a deploy.
 */

import { findTTSModel } from "./model-catalog";

/** USD per 1,000 TTS characters, with env override. */
export function ttsUsdPer1kChars(modelId: string): number {
  const override = Number(process.env.ELEVENLABS_TTS_USD_PER_1K_CHARS);
  if (Number.isFinite(override) && override > 0) return override;
  return findTTSModel(modelId)?.usdPer1kChars ?? 0.06;
}

/** USD per audio-minute of STT, with env override. */
export function sttUsdPerMinute(): number {
  const override = Number(process.env.ELEVENLABS_STT_USD_PER_MIN);
  if (Number.isFinite(override) && override > 0) return override;
  return 0.4;
}

/** USD per conversation-minute (Mode B), with env override. */
export function conversationUsdPerMinute(): number {
  const override = Number(process.env.ELEVENLABS_CONV_USD_PER_MIN);
  if (Number.isFinite(override) && override > 0) return override;
  return 0.1;
}

/** Convert USD to integer micro-dollars (the usage_events unit). */
export function usdToMicros(usd: number): number {
  return Math.max(0, Math.round(usd * 1_000_000));
}

export function ttsCostUsdMicros(modelId: string, characters: number): number {
  return usdToMicros((characters / 1_000) * ttsUsdPer1kChars(modelId));
}

export function sttCostUsdMicros(audioSeconds: number): number {
  return usdToMicros((audioSeconds / 60) * sttUsdPerMinute());
}

export function conversationCostUsdMicros(durationSeconds: number): number {
  return usdToMicros((durationSeconds / 60) * conversationUsdPerMinute());
}
