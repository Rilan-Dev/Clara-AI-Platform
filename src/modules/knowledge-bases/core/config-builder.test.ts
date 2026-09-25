import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./config-builder";
import type { AssistantConfig } from "./models";

const base = {
  assistantName: "Clara",
  systemPrompt: "You are OUIC Care, a bilingual support assistant.",
  welcomeMessage: "Hello! How can I help?",
  outOfScopeReply: "I can only answer questions about the topics I have been set up for.",
  strictMode: true,
  citeSources: true,
  rules: [],
  faqItems: [],
  defaultLanguage: "en",
  allowedLanguages: ["en", "ta"],
  alwaysRespondIn: null,
} as unknown as AssistantConfig;

describe("buildSystemPrompt — operator prompt is authoritative, no canned refusal", () => {
  const prompt = buildSystemPrompt(base, { kbName: "Test Data", surface: "chat", allowedLanguages: ["en", "ta"] });

  it("keeps the operator's own identity instead of forcing 'a voice assistant'", () => {
    expect(prompt).toContain("You are OUIC Care");
    expect(prompt).not.toContain("a voice assistant");
    expect(prompt).toMatch(/operator instructions above take precedence/);
  });

  it("never tells the model to recite the fallback reply verbatim", () => {
    expect(prompt).not.toMatch(/say exactly/i);
    expect(prompt).toContain("do not recite it word for word");
    expect(prompt).toMatch(/Greetings, thanks, pleasantries, small talk/);
  });
});
