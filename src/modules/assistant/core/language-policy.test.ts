import { describe, expect, it } from "vitest";
import {
  detectVisitorLanguage,
  greetingInstruction,
  languagePolicyInstruction,
  normalizeLanguagePolicy,
  replyLanguageDirective,
  resolveReplyLanguage,
  sarvamSpeechLanguage,
  speechRecognitionLanguage,
} from "./language-policy";

// Default English; Tamil, Hindi and Telugu also allowed (the tenant's setup).
const policy = normalizeLanguagePolicy({ defaultLanguage: "en", allowedLanguages: ["en", "ta", "hi", "te"] });
const reply = (text: string, p = policy) => resolveReplyLanguage(p, detectVisitorLanguage(text, p.allowedLanguages));

describe("language policy — start in default, mirror allowed, else default", () => {
  it("replies in an allowed language the visitor speaks", () => {
    expect(reply("எனக்கு ஹோம் இன்சூரன்ஸ் பற்றி தெரியணும்").language).toBe("ta");
    expect(reply("मुझे बीमा के बारे में बताइए").language).toBe("hi");
    expect(reply("నాకు సహాయం కావాలి").language).toBe("te");
  });

  it("falls back to the DEFAULT language when the visitor's language is not allowed", () => {
    const arabic = reply("ما هو التأمين المنزلي؟");
    expect(arabic).toMatchObject({ language: "en", reason: "not-allowed", detected: "ar" });
    const taDefault = normalizeLanguagePolicy({ defaultLanguage: "ta", allowedLanguages: ["ta", "en"] });
    expect(reply("ما هو التأمين المنزلي؟", taDefault).language).toBe("ta");
    expect(reply("日本語で教えて", taDefault).language).toBe("ta");
  });

  it("does not mistake English 'help' for Tamil (old heuristic bug)", () => {
    expect(reply("Can you help me with my claim?").language).toBe("en");
  });

  it("honours an explicit request for an allowed language only", () => {
    expect(reply("please answer in Hindi").language).toBe("hi");
    expect(reply("please reply in French")).toMatchObject({ language: "en", reason: "not-allowed" });
  });

  it("'Always respond in' overrides the visitor's language", () => {
    const fixed = normalizeLanguagePolicy({ defaultLanguage: "en", allowedLanguages: ["en", "ta"], alwaysRespondIn: "ta" });
    expect(reply("hello there", fixed)).toMatchObject({ language: "ta", reason: "fixed" });
    expect(languagePolicyInstruction(fixed)).toMatch(/always speak and write in Tamil/);
  });

  it("lets the model decide between several Latin-script languages", () => {
    const latin = normalizeLanguagePolicy({ defaultLanguage: "en", allowedLanguages: ["en", "es", "fr"] });
    const decision = reply("Hola, ¿cómo puedo renovar mi póliza?", latin);
    expect(decision.language).toBeNull();
    expect(replyLanguageDirective(latin, decision)).toMatch(/visitor's language if it is one of: English \(en\), Spanish \(es\), French \(fr\); otherwise reply in English/);
  });

  it("always includes the default language in the allowed list", () => {
    expect(normalizeLanguagePolicy({ defaultLanguage: "ta", allowedLanguages: ["en"] }).allowedLanguages).toEqual(["ta", "en"]);
  });

  it("session instruction: start in default, mirror allowed, fall back to default", () => {
    const text = languagePolicyInstruction(policy);
    expect(text).toMatch(/start the conversation \(including any greeting\) in English/);
    expect(text).toMatch(/Tamil \(ta\)/);
    expect(text).toMatch(/any other language, reply in English/);
  });

  it("greeting is spoken in the default language", () => {
    const ta = normalizeLanguagePolicy({ defaultLanguage: "ta", allowedLanguages: ["ta", "en"] });
    expect(greetingInstruction(ta, "Hello! How can I help?")).toMatch(/Greet the visitor in Tamil/);
  });
});

describe("speech recognition follows the policy", () => {
  it("auto-detects for multi-language assistants", () => {
    expect(speechRecognitionLanguage(policy)).toBeNull();
  });
  it("pins a single or fixed language", () => {
    expect(speechRecognitionLanguage(normalizeLanguagePolicy({ defaultLanguage: "hi", allowedLanguages: ["hi"] }))).toBe("hi");
    expect(speechRecognitionLanguage(normalizeLanguagePolicy({ defaultLanguage: "en", allowedLanguages: ["en", "ta"], alwaysRespondIn: "ta" }))).toBe("ta");
  });
  it("voices each Sarvam sentence in its own language", () => {
    expect(sarvamSpeechLanguage("வணக்கம், எப்படி உதவலாம்?", "en-IN")).toBe("ta-IN");
    expect(sarvamSpeechLanguage("Hello there", "ta-IN")).toBe("en-IN");
    expect(sarvamSpeechLanguage("ନମସ୍କାର", "en-IN")).toBe("od-IN");
    expect(sarvamSpeechLanguage("你好", "en-IN")).toBe("en-IN");
  });
});
