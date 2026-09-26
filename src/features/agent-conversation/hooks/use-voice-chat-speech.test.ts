import { describe, expect, it } from "vitest";
import { chunkForSpeech, isVoiceChatProvider } from "./use-voice-chat-speech";

describe("Voice Chat (chat window) speech helpers", () => {
  it("offers one-shot Voice Chat only for providers that serve it", () => {
    expect(isVoiceChatProvider("sarvam")).toBe(true);
    expect(isVoiceChatProvider("elevenlabs")).toBe(true);
    // OpenAI / Gemini voice is realtime-only — no chat-window controls.
    expect(isVoiceChatProvider("openai")).toBe(false);
    expect(isVoiceChatProvider("gemini")).toBe(false);
    expect(isVoiceChatProvider(null)).toBe(false);
  });

  it("splits replies into sentence-aligned chunks under the per-request budget", () => {
    const text = "First sentence. Second one! Third? " + "यह हिंदी वाक्य है। ".repeat(3);
    const chunks = chunkForSpeech(text, 40);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("hard-splits a single sentence longer than the budget", () => {
    const chunks = chunkForSpeech("x".repeat(95), 40);
    expect(chunks.map((c) => c.length)).toEqual([40, 40, 15]);
  });
});
