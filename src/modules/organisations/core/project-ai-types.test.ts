import { describe, expect, it } from "vitest";
import { resolveProjectRuntimeSelection } from "./project-ai-types";

describe("project AI runtime isolation", () => {
  it("only allows languages assigned to the project", () => {
    const result = resolveProjectRuntimeSelection({
      provider: "openai",
      assistantLanguage: "fr",
      assignedLanguages: [
        { code: "en", enabled: true },
        { code: "ar", enabled: true },
      ],
      assignedVoices: [],
    });
    expect(result.allowedLanguages).toEqual(["en", "ar"]);
    expect(result.defaultLanguage).toBe("en");
  });

  it("does not allow an assistant voice from another project", () => {
    const result = resolveProjectRuntimeSelection({
      provider: "openai",
      assistantLanguage: "en",
      assistantVoice: "voice-from-project-b",
      assignedLanguages: [{ code: "en", enabled: true }],
      assignedVoices: [{ provider: "openai", voiceId: "alloy", enabled: true }],
    });
    expect(result.voiceId).toBe("alloy");
  });

  it("does not use a voice from another provider", () => {
    const result = resolveProjectRuntimeSelection({
      provider: "openai",
      assistantLanguage: "en",
      assistantVoice: "puck",
      assignedLanguages: [{ code: "en", enabled: true }],
      assignedVoices: [
        { provider: "gemini", voiceId: "puck", enabled: true },
        { provider: "openai", voiceId: "marin", enabled: true },
      ],
    });
    expect(result.voiceId).toBe("marin");
  });

  it("ignores disabled language and voice assignments", () => {
    const result = resolveProjectRuntimeSelection({
      provider: "openai",
      assistantLanguage: "de",
      assistantVoice: "nova",
      assignedLanguages: [
        { code: "de", enabled: false },
        { code: "en", enabled: true },
      ],
      assignedVoices: [
        { provider: "openai", voiceId: "nova", enabled: false },
        { provider: "openai", voiceId: "cedar", enabled: true },
      ],
    });
    expect(result.allowedLanguages).toEqual(["en"]);
    expect(result.defaultLanguage).toBe("en");
    expect(result.voiceId).toBe("cedar");
  });
});
