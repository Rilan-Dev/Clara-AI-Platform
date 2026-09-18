import { describe, expect, it } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  buildLanguageGuidance,
  describeLanguage,
  isSupportedLanguage,
  normaliseLanguageCode,
  resolveLanguagePreferences,
} from "./config";

describe("assistant language configuration", () => {
  it("contains unique ISO-639-1 language codes", () => {
    const codes = SUPPORTED_LANGUAGES.map((language) => language.code);

    expect(codes.length).toBeGreaterThanOrEqual(50);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[a-z]{2}$/.test(code))).toBe(true);
  });

  it("contains the core languages used by the existing UI and realtime flows", () => {
    expect([
      "en",
      "ar",
      "fr",
      "es",
      "de",
      "zh",
      "ja",
      "pt",
      "tr",
      "ru",
      "hi",
      "ur",
      "ta",
    ].every(isSupportedLanguage)).toBe(true);
  });

  it("contains the platform's market languages and the added Indic/Asian catalog", () => {
    // si (Sinhala) is the platform's home market — it was historically missing
    // from this catalog while being offered first in the settings UI pickers.
    // The rest are the Indic/SE-Asian additions that close the gap between the
    // canonical catalog and the vendor STT/TTS coverage.
    expect([
      "si",
      "bn",
      "ml",
      "te",
      "gu",
      "pa",
      "kn",
      "mr",
      "my",
      "km",
      "lo",
      "ka",
    ].every(isSupportedLanguage)).toBe(true);
  });

  it("normalises language codes before validation", () => {
    expect(normaliseLanguageCode("  AR ")).toBe("ar");
    expect(isSupportedLanguage(" EN ")).toBe(true);
    expect(isSupportedLanguage("xx")).toBe(false);
  });

  it("returns a stable human-readable language description", () => {
    expect(describeLanguage("ta")).toBe("Tamil (ta)");
    expect(describeLanguage(" unknown ")).toBe("unknown");
    expect(describeLanguage(" ")).toBe("English (en)");
  });

  it("falls back to English for an invalid assistant language", () => {
    expect(
      resolveLanguagePreferences({
        assistant: "xx",
        customer: ["xx", "fr"],
      }),
    ).toEqual({ assistant: "en", customer: ["en", "fr"] });
  });

  it("removes invalid and duplicate customer languages", () => {
    expect(
      resolveLanguagePreferences({
        assistant: "fr",
        customer: ["fr", "FR", "xx", "ar", "ar"],
      }),
    ).toEqual({ assistant: "fr", customer: ["fr", "ar"] });
  });

  it("always includes the configured assistant language in customer languages", () => {
    expect(
      resolveLanguagePreferences({
        assistant: "de",
        customer: ["en", "ar"],
      }),
    ).toEqual({ assistant: "de", customer: ["de", "en", "ar"] });
  });

  it("uses English defaults when language preferences are absent", () => {
    expect(resolveLanguagePreferences()).toEqual({
      assistant: "en",
      customer: ["en"],
    });
  });

  it("generates language guidance for chat and realtime sessions", () => {
    const guidance = buildLanguageGuidance({
      assistant: "en",
      customer: ["en", "ar", "ta"],
    });

    expect(guidance.session).toContain("English (en)");
    expect(guidance.session).toContain("Arabic (ar)");
    expect(guidance.session).toContain("Tamil (ta)");
    expect(guidance.quick).toContain("English (en)");
    expect(guidance.follow).toContain("English (en)");
    expect(guidance.chat).toContain("English (en)");
  });

  it("does not emit unsupported language codes into runtime guidance", () => {
    const guidance = buildLanguageGuidance({
      assistant: "en",
      customer: ["en", "xx", "zz"],
    });

    expect(guidance.session).not.toContain("xx");
    expect(guidance.session).not.toContain("zz");
    expect(guidance.chat).toContain("English (en)");
  });
});
