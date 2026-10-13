import { describe, expect, it } from "vitest";
import {
  geminiChatOptions,
  realtimeOptions,
  elevenlabsRealtimeTtsOptions,
  type LiveAIModelOption,
} from "./ai-settings-options";

describe("live provider model options", () => {
  it("sorts known lower-cost models first and uses release metadata as a tie-breaker", () => {
    const models: LiveAIModelOption[] = [
      { modelId: "gemini-new-expensive", displayName: "New expensive", kind: "chat", metadata: { inputUsdPerMTokens: 1.2, releaseDate: "2026-10-01" } },
      { modelId: "gemini-old-cheap", displayName: "Old cheap", kind: "chat", metadata: { inputUsdPerMTokens: 0.1, releaseDate: "2025-01-01" } },
      { modelId: "gemini-new-cheap", displayName: "New cheap", kind: "chat", metadata: { inputUsdPerMTokens: 0.1, releaseDate: "2026-09-01" } },
    ];
    expect(geminiChatOptions(models).map((option) => option.value)).toEqual([
      "gemini-new-cheap",
      "gemini-old-cheap",
      "gemini-new-expensive",
    ]);
  });

  it("filters Gemini realtime choices by the live realtime kind", () => {
    const models: LiveAIModelOption[] = [
      { modelId: "gemini-chat", displayName: "Chat", kind: "chat" },
      { modelId: "gemini-live", displayName: "Live", kind: "realtime" },
    ];
    expect(realtimeOptions("gemini", models).map((option) => option.value)).toEqual(["gemini-live"]);
  });

  it("does not hardcode ElevenLabs realtime TTS model IDs", () => {
    const models: LiveAIModelOption[] = [
      { modelId: "eleven-new-flash", displayName: "New Flash", kind: "tts", metadata: { usdPer1kChars: 0.04 } },
    ];
    expect(elevenlabsRealtimeTtsOptions(models).map((option) => option.value)).toEqual(["eleven-new-flash"]);
    expect(elevenlabsRealtimeTtsOptions()).toEqual([]);
  });
});
