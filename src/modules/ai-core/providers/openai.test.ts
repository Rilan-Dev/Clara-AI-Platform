import { describe, expect, it } from "vitest";
import { supportsTemperature } from "./openai";

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
