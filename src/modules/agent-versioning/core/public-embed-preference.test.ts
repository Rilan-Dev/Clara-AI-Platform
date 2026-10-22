import { describe, expect, it } from "vitest";
import type { AgentVersionConfig } from "./types";
import { changesPublicEmbedPreference } from "./public-embed-preference";

const config = (
  embed: boolean | null,
  voice = true,
): AgentVersionConfig => ({
  assistant: { assistantName: "Agent" } as AgentVersionConfig["assistant"],
  ai: null,
  runtime: embed === null
    ? null
    : { enableVoice: voice, enableRealtime: true, enablePublicEmbed: embed },
});

describe("disabled public embed preference protection", () => {
  it("rejects enable and disable changes regardless of direction", () => {
    expect(changesPublicEmbedPreference(config(true), config(false))).toBe(true);
    expect(changesPublicEmbedPreference(config(false), config(true))).toBe(true);
  });

  it("preserves native voice changes and unchanged embedded preferences", () => {
    expect(changesPublicEmbedPreference(config(true), config(true, false))).toBe(false);
    expect(changesPublicEmbedPreference(config(false), config(false, false))).toBe(false);
  });

  it("does not treat materializing a legacy inherited true as a widget mutation", () => {
    expect(changesPublicEmbedPreference(config(null), config(true))).toBe(false);
    expect(changesPublicEmbedPreference(config(true), config(null))).toBe(false);
    expect(changesPublicEmbedPreference(config(null), config(false))).toBe(true);
    expect(changesPublicEmbedPreference(config(false), config(null))).toBe(true);
  });
});
