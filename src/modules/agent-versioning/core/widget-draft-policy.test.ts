import { describe, expect, it } from "vitest";
import type { AgentVersionConfig } from "./types";
import { changesDisabledWidgetDesign, preserveDisabledWidgetDesign } from "./widget-draft-policy";
import { WIDGET_DESIGN_FIELDS } from "@/modules/knowledge-bases/core/widget-config-policy";

const config = (assistant: Record<string, unknown>): AgentVersionConfig => ({
  assistant: {
    assistantName: "Clara", welcomeMessage: "Hello", systemPrompt: "Current prompt",
    primaryColour: "#123456", widgetTheme: "dark",
    customInjectJs: "window.saved = true", voiceBtnSize: 44,
    ...assistant,
  } as AgentVersionConfig["assistant"],
  ai: null,
  runtime: { enableVoice: true, enableRealtime: true, enablePublicEmbed: true },
  knowledge: { kbIds: [] },
});

describe("disabled embeddable widget design in agent-versioning drafts", () => {
  const existing = config({});

  it("detects explicit changed design fields, including advanced injected scripts", () => {
    for (const field of ["primaryColour", "widgetTheme", "customInjectJs", "voiceBtnSize"] as const) {
      const next = config({ [field]: "changed" });
      expect(changesDisabledWidgetDesign(existing, next)).toBe(true);
    }
  });

  it("does not treat ordinary agent persona, native voice or AI changes as widget changes", () => {
    const next = config({ assistantName: "Renamed", systemPrompt: "Updated", voiceId: "alloy" });
    next.runtime = { enableVoice: false, enableRealtime: true, enablePublicEmbed: true };
    expect(changesDisabledWidgetDesign(existing, next)).toBe(false);
  });

  it("accepts identical widget appearance and missing optional widget keys", () => {
    const next = config({ assistantName: "Renamed" });
    delete (next.assistant as unknown as Record<string, unknown>).widgetTheme;
    expect(changesDisabledWidgetDesign(existing, next)).toBe(false);
  });

  it("preserves every enumerated widget field without mutating the supplied configuration", () => {
    const incoming = config({
      assistantName: "New persona", systemPrompt: "New prompt", widgetTheme: "light",
      primaryColour: "#ffffff", customInjectJs: "window.bad = true", voiceBtnSize: 68,
    });
    const before = JSON.stringify(incoming);
    const result = preserveDisabledWidgetDesign(existing, incoming);
    expect(JSON.stringify(incoming)).toBe(before);
    for (const field of WIDGET_DESIGN_FIELDS) {
      expect(result.assistant[field]).toEqual(existing.assistant[field]);
    }
    expect(result.assistant.assistantName).toBe("New persona");
    expect(result.assistant.systemPrompt).toBe("New prompt");
    expect(result.ai).toEqual(incoming.ai);
    expect(result.runtime).toEqual(incoming.runtime);
  });

  it("does not alter the existing baseline or alias its assistant object", () => {
    const result = preserveDisabledWidgetDesign(existing, config({ welcomeMessage: "Fresh" }));
    expect(result.assistant).not.toBe(existing.assistant);
    expect(result.assistant.welcomeMessage).toBe("Fresh");
    expect(existing.assistant.welcomeMessage).toBe("Hello");
  });

  it("detects changes in all 74 known widget fields without treating undefined as a new change", () => {
    expect(WIDGET_DESIGN_FIELDS).toHaveLength(74);
    for (const field of WIDGET_DESIGN_FIELDS) {
      const original = existing.assistant[field];
      const candidate = config({ [field]: original === "changed" ? "different" : "changed" });
      expect(changesDisabledWidgetDesign(existing, candidate)).toBe(true);
    }
  });
});
