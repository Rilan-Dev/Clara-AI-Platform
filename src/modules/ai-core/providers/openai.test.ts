import { describe, expect, it } from "vitest";
import { reasoningEffortFor, supportsTemperature } from "./openai";
import { geminiThinkingCanBeDisabled } from "./gemini";

describe("OpenAI provider parameter compatibility", () => {
  it("does not send temperature to GPT-5.6 reasoning models", () => {
    expect(supportsTemperature("gpt-5.6-luna")).toBe(false);
    expect(supportsTemperature("gpt-5.6-sol")).toBe(false);
    expect(supportsTemperature("gpt-5.6-terra")).toBe(false);
  });

  it("keeps temperature enabled for regular chat models", () => {
    expect(supportsTemperature("gpt-4o-mini")).toBe(true);
    expect(supportsTemperature("gpt-5.3-chat-latest")).toBe(true);
  });
});

describe("fast-turn reasoning hint", () => {
  it("asks reasoning models for low effort on fast turns and leaves the default otherwise", () => {
    expect(reasoningEffortFor("gpt-5.6-luna", null)).toBe("low");
    expect(reasoningEffortFor("gpt-5-mini", null)).toBe("low");
    expect(reasoningEffortFor("o4-mini", "medium")).toBe("medium");
    expect(reasoningEffortFor("gpt-5.6-luna", undefined)).toBeUndefined();
  });

  it("never sends reasoning_effort to non-reasoning chat models", () => {
    expect(reasoningEffortFor("gpt-4o-mini", null)).toBeUndefined();
    expect(reasoningEffortFor("gpt-5.3-chat-latest", null)).toBeUndefined();
  });

  it("only turns Gemini thinking off where the model allows it", () => {
    expect(geminiThinkingCanBeDisabled("gemini-2.5-flash")).toBe(true);
    expect(geminiThinkingCanBeDisabled("gemini-2.5-flash-lite")).toBe(true);
    expect(geminiThinkingCanBeDisabled("gemini-2.5-pro")).toBe(false);
  });
});
