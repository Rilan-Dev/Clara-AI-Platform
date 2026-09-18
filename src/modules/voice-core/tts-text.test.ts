/**
 * Unit tests for the TTS text sanitizer + non-speech transcript filter.
 *
 * Grounded in the production HAR from clara.ai.amazetechclans.com
 * (2026-09-18): answers with [S1]/[S2] citation tags and "- " bullets were
 * spoken verbatim, and a trailing "[S2]" fragment was dispatched as its own
 * TTS call. These tests pin the fixed behaviour.
 */

import { describe, expect, it } from "vitest";
import { isNonSpeechTranscript, sanitizeTtsText } from "./tts-text";

describe("sanitizeTtsText", () => {
  it("strips inline citation tags but keeps the sentence", () => {
    const input = "GST is a goods and services tax. [S1][S2]";
    expect(sanitizeTtsText(input)).toBe("GST is a goods and services tax.");
  });

  it("returns empty for citation-only fragments (the HAR '[S2]' TTS call)", () => {
    expect(sanitizeTtsText("[S2]")).toBe("");
    expect(sanitizeTtsText("  [S1] [S3] ")).toBe("");
  });

  it("strips bullet and numbered list markers", () => {
    const input = "- வரி செலுத்துவோரைக் கண்காணித்தல் [S1]";
    expect(sanitizeTtsText(input)).toBe("வரி செலுத்துவோரைக் கண்காணித்தல்");
  });

  it("keeps Tamil/English mixed content intact apart from markers", () => {
    const input = "GST Department என்பது இந்தியாவில் Goods and Services Tax (GST) முறையை நிர்வகிக்கிறது. [S1]";
    expect(sanitizeTtsText(input)).toBe(
      "GST Department என்பது இந்தியாவில் Goods and Services Tax (GST) முறையை நிர்வகிக்கிறது.",
    );
  });

  it("flattens markdown structure — headings, bold, italic, quotes", () => {
    const input = "## **Key** tasks\n> note\n- _register_ businesses";
    expect(sanitizeTtsText(input)).toBe("Key tasks note register businesses");
  });

  it("keeps markdown link labels and drops URLs", () => {
    const input = "See [the portal](https://gst.gov.in) for details.";
    expect(sanitizeTtsText(input)).toBe("See the portal for details.");
  });

  it("drops fenced code blocks and unwraps inline code", () => {
    const input = "Run `npm install`:\n```js\nconst x = 1;\n```\nDone.";
    expect(sanitizeTtsText(input)).toBe("Run npm install: Done.");
  });

  it("collapses all whitespace to single spaces", () => {
    expect(sanitizeTtsText("Hello   world\n\nagain\t!")).toBe("Hello world again !");
  });

  it("keeps plain sentences untouched", () => {
    expect(sanitizeTtsText("How can I help you today?")).toBe("How can I help you today?");
  });

  it("handles empty and whitespace-only input", () => {
    expect(sanitizeTtsText("")).toBe("");
    expect(sanitizeTtsText("   \n\t  ")).toBe("");
  });
});

describe("isNonSpeechTranscript", () => {
  it("flags Scribe sound-event annotations as non-speech", () => {
    expect(isNonSpeechTranscript("[heartbeat]")).toBe(true);
    expect(isNonSpeechTranscript("[wind blowing]")).toBe(true);
    expect(isNonSpeechTranscript("[outro jingle]")).toBe(true);
    expect(isNonSpeechTranscript(" [laughter] ")).toBe(true);
  });

  it("flags empty transcripts", () => {
    expect(isNonSpeechTranscript("")).toBe(true);
    expect(isNonSpeechTranscript("   ")).toBe(true);
  });

  it("passes real speech through (Tamil, English, mixed)", () => {
    expect(isNonSpeechTranscript("ஆஹ் எனக்கு வந்து GST department பத்தி கொஞ்சம் details தான் தெரியணும்.")).toBe(false);
    expect(isNonSpeechTranscript("Hi")).toBe(false);
    expect(isNonSpeechTranscript("Department பத்தி தெரியுமா Sir?")).toBe(false);
  });

  it("passes speech with a trailing sound event through", () => {
    expect(isNonSpeechTranscript("Hello there [wind blowing]")).toBe(false);
  });
});
