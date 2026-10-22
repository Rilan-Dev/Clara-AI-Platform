import { describe, expect, it } from "vitest";
import type {
  AssistantConfig, PatchAssistantConfigInput, PutAssistantConfigInput,
} from "./models";
import {
  WIDGET_DESIGN_FIELDS,
  preserveDisabledWidgetFieldsOnPatch,
  preserveDisabledWidgetFieldsOnPut,
} from "./widget-config-policy";

function oldConfig(): AssistantConfig {
  // Every design field gets a unique marker so omissions in PUT restoration
  // and late-listed advanced/voice appearance fields cannot go unnoticed.
  return {
    assistantName: "Clara",
    systemPrompt: "Old instructions",
    ...Object.fromEntries(WIDGET_DESIGN_FIELDS.map((field) => [field, "saved:" + field])),
    widgetTheme: "dark",
    primaryColour: "#123456",
    headerBg: null,
    widgetShowBranding: false,
    voiceBtnSize: 44,
  } as unknown as AssistantConfig;
}

describe("disabled widget field policy for shared agent config API", () => {
  it("covers the entire saved widget appearance field family", () => {
    expect(WIDGET_DESIGN_FIELDS).toHaveLength(74);
    expect(new Set(WIDGET_DESIGN_FIELDS).size).toBe(WIDGET_DESIGN_FIELDS.length);
    for (const key of ["primaryColour", "launcherColour", "widgetMode",
      "headerBg", "customInjectJs", "voiceBtnBg", "voiceWaveColor"]) {
      expect(WIDGET_DESIGN_FIELDS).toContain(key);
    }
    for (const unrelated of ["assistantName", "avatarUrl", "welcomeMessage",
      "voiceId", "speed", "defaultLanguage", "systemPrompt"]) {
      expect(WIDGET_DESIGN_FIELDS).not.toContain(unrelated);
    }
  });

  it("restores every saved widget field on an unrelated full PUT without resetting customizations", () => {
    const existing = oldConfig();
    const incoming = {
      assistantName: "Updated agent",
      systemPrompt: "Updated instructions",
      widgetTheme: "light",
      primaryColour: "#ffffff",
    } as PutAssistantConfigInput;

    expect(preserveDisabledWidgetFieldsOnPut(
      incoming,
      { assistantName: "Updated agent", systemPrompt: "Updated instructions" },
      existing,
    )).toBe(true);
    expect(incoming.assistantName).toBe("Updated agent");
    expect(incoming.systemPrompt).toBe("Updated instructions");
    for (const field of WIDGET_DESIGN_FIELDS) {
      expect(incoming[field]).toEqual(existing[field]);
    }
  });

  it("rejects explicitly changed design fields even when mixed with legitimate core edits", () => {
    const existing = oldConfig();
    const incoming = { assistantName: "Updated", widgetTheme: "light" } as PutAssistantConfigInput;
    expect(preserveDisabledWidgetFieldsOnPut(
      incoming, { assistantName: "Updated", widgetTheme: "light" }, existing,
    )).toBe(false);
  });

  it("accepts an explicitly unchanged design field but preserves all other stored styles", () => {
    const existing = oldConfig();
    const input = { assistantName: "New", widgetTheme: "dark" } as PutAssistantConfigInput;
    expect(preserveDisabledWidgetFieldsOnPut(input, {
      assistantName: "New", widgetTheme: "dark",
    }, existing)).toBe(true);
    expect(input.customInjectJs).toBe(existing.customInjectJs);
  });

  it("permits first-time core setup without widget settings and rejects widget edits", () => {
    expect(preserveDisabledWidgetFieldsOnPut(
      { assistantName: "Clara" } as PutAssistantConfigInput,
      { assistantName: "Clara" },
      null,
    )).toBe(true);
    expect(preserveDisabledWidgetFieldsOnPut(
      { widgetTheme: "light" } as PutAssistantConfigInput,
      { widgetTheme: "light" },
      null,
    )).toBe(false);
  });

  it("strips unchanged widget fields on PATCH while preserving core updates", () => {
    const existing = oldConfig();
    const patch: PatchAssistantConfigInput = {
      assistantName: "Renamed", widgetTheme: "dark", primaryColour: "#123456",
      headerBg: null, voiceBtnSize: 44,
    };
    expect(preserveDisabledWidgetFieldsOnPatch(patch, existing)).toBe(true);
    expect(patch).toEqual({ assistantName: "Renamed" });
  });

  it("denies PATCH changes to advanced or voice-button appearance before writing", () => {
    const existing = oldConfig();
    expect(preserveDisabledWidgetFieldsOnPatch(
      { customInjectJs: "alert(1)" }, existing,
    )).toBe(false);
    expect(preserveDisabledWidgetFieldsOnPatch(
      { voiceBtnSize: 60 }, existing,
    )).toBe(false);
    expect(preserveDisabledWidgetFieldsOnPatch(
      { headerBg: "#ffffff" }, existing,
    )).toBe(false);
  });

  it("allows core-only PATCH on missing configuration but no widget mutation", () => {
    const core: PatchAssistantConfigInput = { welcomeMessage: "Hello!" };
    expect(preserveDisabledWidgetFieldsOnPatch(core, null)).toBe(true);
    expect(core.welcomeMessage).toBe("Hello!");
    expect(preserveDisabledWidgetFieldsOnPatch({ widgetMode: "inline" }, null))
      .toBe(false);
  });
});
