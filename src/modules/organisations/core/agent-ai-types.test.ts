import { describe, expect, it } from "vitest";
import { resolveAgentRuntimeSelection } from "./agent-ai-types";

describe("project AI runtime isolation", () => {
  it("only allows languages assigned to the project", () => {
    const result = resolveAgentRuntimeSelection({
      provider: "openai",
      assistantLanguage: "fr",
      assistantVoice: null,
      assignedLanguages: [
        { code: "en", enabled: true },
        { code: "ar", enabled: true },
      ],
      assignedVoices: [],
    });
    expect(result.allowedLanguages).toEqual(["en", "ar"]);
    expect(result.defaultLanguage).toBe("en");
  });

  it("uses the assistant's configured language list when it is explicitly configured", () => {
    const result = resolveAgentRuntimeSelection({
      provider: "openai",
      assistantLanguage: "ar",
      assistantAllowedLanguages: ["en", "ar", "ta", "ur"],
      assistantVoice: null,
      assignedLanguages: [{ code: "en", enabled: true }],
      assignedVoices: [],
    });
    expect(result.allowedLanguages).toEqual(["en", "ar", "ta", "ur"]);
    expect(result.defaultLanguage).toBe("ar");
  });

  it("uses the assistant's configured voice when the project has no voice assignment", () => {
    const result = resolveAgentRuntimeSelection({
      provider: "openai",
      assistantLanguage: "en",
      assistantVoice: "sage",
      assignedLanguages: [{ code: "en", enabled: true }],
      assignedVoices: [],
    });
    expect(result.voiceId).toBe("sage");
  });

  it("does not allow an assistant voice from another project", () => {
    const result = resolveAgentRuntimeSelection({
      provider: "openai",
      assistantLanguage: "en",
      assistantVoice: "voice-from-project-b",
      assignedLanguages: [{ code: "en", enabled: true }],
      assignedVoices: [{ provider: "openai", voiceId: "alloy", enabled: true }],
    });
    expect(result.voiceId).toBe("alloy");
  });

  it("does not use a voice from another provider", () => {
    const result = resolveAgentRuntimeSelection({
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
    const result = resolveAgentRuntimeSelection({
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