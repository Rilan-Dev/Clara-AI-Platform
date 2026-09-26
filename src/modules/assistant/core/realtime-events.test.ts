import { describe, expect, it } from "vitest";
import {
  extractResponseText,
  isAssistantAudioDelta,
  isAssistantTranscriptDelta,
} from "./realtime-events";

describe("OpenAI Realtime event names", () => {
  it("accepts GA and beta transcript deltas", () => {
    expect(isAssistantTranscriptDelta("response.output_audio_transcript.delta")).toBe(true);
    expect(isAssistantTranscriptDelta("response.output_text.delta")).toBe(true);
    expect(isAssistantTranscriptDelta("response.audio_transcript.delta")).toBe(true);
    expect(isAssistantTranscriptDelta("response.text.delta")).toBe(true);
    expect(isAssistantTranscriptDelta("response.done")).toBe(false);
  });

  it("accepts GA and beta audio deltas", () => {
    expect(isAssistantAudioDelta("response.output_audio.delta")).toBe(true);
    expect(isAssistantAudioDelta("response.audio.delta")).toBe(true);
    expect(isAssistantAudioDelta("response.output_audio_transcript.delta")).toBe(false);
  });

  it("extracts the answer from a response.done payload", () => {
    const response = {
      output: [
        { type: "message", role: "assistant", content: [{ type: "output_audio", transcript: "வணக்கம்! " }, { type: "output_text", text: "Home insurance covers…" }] },
        { type: "function_call", name: "rag_search" },
      ],
    };
    expect(extractResponseText(response)).toBe("வணக்கம்! Home insurance covers…");
    expect(extractResponseText(null)).toBe("");
  });
});
