/**
 * Unit tests for the streaming-TTS sentence chunker — colocated with
 * realtime-audio-config.test.ts in the shared client-side voice utils.
 *
 * The same function the useElevenLabsVoice hook imports (no mirrored
 * duplicate): complete sentences are dispatched to TTS while the chat
 * answer is still streaming.
 */

import { describe, expect, it } from "vitest";
import { splitSentences, TTS_SENTENCE_MIN_CHARS } from "./sentence-split";

describe("sentence chunking", () => {
  it("splits on terminal punctuation and keeps the remainder", () => {
    const { sentences, rest } = splitSentences(
      "This is the first sentence. And here comes the second one! A trailing fragment",
    );
    expect(sentences).toEqual(["This is the first sentence.", "And here comes the second one!"]);
    expect(rest.trim()).toBe("A trailing fragment");
  });

  it("returns nothing when no sentence is complete yet", () => {
    const { sentences, rest } = splitSentences("Still generating the first");
    expect(sentences).toEqual([]);
    expect(rest).toBe("Still generating the first");
  });

  it("handles international punctuation", () => {
    const { sentences } = splitSentences("Is this a question? Sí, es una respuesta.");
    expect(sentences.length).toBe(2);
  });

  it("skips fragments below the minimum speakable length", () => {
    const { sentences, rest } = splitSentences("No. This one is long enough to speak.");
    // "No." is below TTS_SENTENCE_MIN_CHARS — never dispatched to TTS.
    expect(sentences).toEqual(["This one is long enough to speak."]);
    expect(rest).toBe("");
    expect(TTS_SENTENCE_MIN_CHARS).toBe(12);
  });
});
