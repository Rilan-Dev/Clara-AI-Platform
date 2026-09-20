/**
 * src/modules/agent-versioning/core/diff.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Semantic diff and three-way merge contracts (implementation plan §7/§11,
 * ElevenLabs alignment §19.6/§19.8):
 *
 *   - diffs are FIELD-AWARE (sections + human labels), never raw JSON;
 *   - restore semantics are exercised through diff immutability (versions are
 *     insert-only — restore = new version with an old config);
 *   - merges: clean incoming changes apply, both-changed fields conflict and
 *     require explicit resolution; unresolved conflicts never merge silently.
 */

import { describe, expect, it } from "vitest";
import { applyMerge, buildMergeReview, changedSections, diffAgentConfigs } from "./diff";
import type { AgentVersionConfig } from "./types";

function makeConfig(overrides: {
  assistant?: Record<string, unknown>;
  ai?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
} = {}): AgentVersionConfig {
  return {
    assistant: {
      assistantName: "Clara",
      avatarUrl: null,
      systemPrompt: "You are Clara.",
      welcomeMessage: "Hello!",
      outOfScopeReply: "Out of scope.",
      rules: ["Be concise"],
      defaultLanguage: "en",
      allowedLanguages: ["en"],
      alwaysRespondIn: null,
      voiceId: "alloy",
      speed: 1,
      temperature: 0.2,
      maxTokens: 2048,
      citeSources: true,
      strictMode: true,
      primaryColour: "#6d5efc",
      accentColour: "#00d4b1",
      launcherColour: "#6d5efc",
      widgetTheme: "light",
      widgetPosition: "bottom-right",
      widgetButtonSize: 56,
      widgetBorderRadius: 20,
      widgetFontFamily: "system-ui",
      widgetChatHeight: 580,
      widgetShowBranding: true,
      widgetLauncherLabel: null,
      widgetMode: "floating",
      ...overrides.assistant,
    } as AgentVersionConfig["assistant"],
    ai: {
      provider: "openai",
      chatModel: "gpt-4o",
      embeddingModel: "text-embedding-3-small",
      realtimeModel: null,
      transcriptionModel: null,
      voiceProvider: null,
      realtimeVoiceProvider: null,
      ...overrides.ai,
    } as AgentVersionConfig["ai"],
    runtime: {
      enableVoice: true,
      enableRealtime: true,
      enablePublicEmbed: true,
      ...overrides.runtime,
    } as AgentVersionConfig["runtime"],
    knowledge: { kbIds: [] },
  };
}

describe("diffAgentConfigs — semantic diff", () => {
  it("reports field-level changes with human labels, grouped into sections", () => {
    const before = makeConfig();
    const after = makeConfig({
      assistant: { assistantName: "Clara AI", allowedLanguages: ["en", "ta"] },
      ai: { chatModel: "gpt-4o-mini" },
    });
    const diff = diffAgentConfigs(before, after, { versionNumber: 11, label: "v11" }, { versionNumber: 12, label: "v12" });

    expect(diff.hasChanges).toBe(true);
    const identity = diff.sections.find((s) => s.key === "identity")!;
    expect(identity.changes[0]!.label).toBe("Assistant name");
    expect(identity.changes[0]!.before).toBe("Clara");
    expect(identity.changes[0]!.after).toBe("Clara AI");

    const language = diff.sections.find((s) => s.key === "language")!;
    const allowed = language.changes.find((c) => c.label === "Allowed languages")!;
    expect(allowed.addedItems).toEqual(["ta"]);

    const ai = diff.sections.find((s) => s.key === "ai")!;
    expect(ai.changes.find((c) => c.label === "Chat model")!.after).toBe("gpt-4o-mini");
  });

  it("marks unchanged sections explicitly (No changes surfaces)", () => {
    const diff = diffAgentConfigs(makeConfig(), makeConfig(), { versionNumber: 1, label: "a" }, { versionNumber: 2, label: "b" });
    expect(diff.hasChanges).toBe(false);
    expect(diff.changeCount).toBe(0);
    expect(changedSections(diff)).toEqual([]);
    // Sections still exist so the review surface can render "No changes".
    expect(diff.sections.map((s) => s.title)).toContain("Knowledge");
  });

  it("renders boolean toggles as toggled_on/toggled_off", () => {
    const before = makeConfig();
    const after = makeConfig({ runtime: { enableRealtime: false } });
    const diff = diffAgentConfigs(before, after, { versionNumber: 1, label: "a" }, { versionNumber: 2, label: "b" });
    const tools = diff.sections.find((s) => s.key === "tools")!;
    const toggle = tools.changes.find((c) => c.label === "Realtime voice")!;
    expect(toggle.kind).toBe("toggled_off");
  });

  it("treats null ai/runtime sections (imported snapshots) as inherit — no fabricated values", () => {
    const imported = makeConfig();
    imported.ai = null;
    imported.runtime = null;
    const live = makeConfig();
    const diff = diffAgentConfigs(imported, live, { versionNumber: 1, label: "v1" }, { versionNumber: 2, label: "v2" });
    const ai = diff.sections.find((s) => s.key === "ai")!;
    // The diff shows unknown → value (added), never invents the before-state.
    expect(ai.changes.find((c) => c.label === "Chat provider")!.kind).toBe("added");
  });
});

describe("buildMergeReview — three-way merge", () => {
  const base = makeConfig();
  const branchBase = makeConfig({ assistant: { systemPrompt: "Base prompt", assistantName: "Clara" } });

  it("clean incoming changes are listed as incoming (compatible)", () => {
    const ours = makeConfig({ assistant: { systemPrompt: "Base prompt", assistantName: "Clara" } });
    const theirs = makeConfig({ assistant: { systemPrompt: "Base prompt", assistantName: "Clara", welcomeMessage: "Vanakkam!" } });
    const review = buildMergeReview({
      base: branchBase, ours, theirs,
      baseVersionNumber: 3, oursVersionNumber: 4, theirsVersionNumber: 2,
      sourceBranch: { id: "b1", name: "experiment/new-voice" },
      targetBranch: { id: "main", name: "Main" },
    });
    expect(review.conflictCount).toBe(0);
    expect(review.compatibleChangeCount).toBe(1);
    const behaviour = review.incoming.find((s) => s.key === "behaviour")!;
    expect(behaviour.changes[0]!.label).toBe("Welcome message");
    expect(behaviour.changes[0]!.after).toBe("Vanakkam!");
  });

  it("both-sides-changed fields become explicit conflicts, never silently chosen", () => {
    const ours = makeConfig({ assistant: { systemPrompt: "Main edited prompt", assistantName: "Clara" } });
    const theirs = makeConfig({ assistant: { systemPrompt: "Branch edited prompt", assistantName: "Clara" } });
    const review = buildMergeReview({
      base: branchBase, ours, theirs,
      baseVersionNumber: 3, oursVersionNumber: 4, theirsVersionNumber: 2,
      sourceBranch: { id: "b1", name: "experiment/new-voice" },
      targetBranch: { id: "main", name: "Main" },
    });
    expect(review.conflictCount).toBe(1);
    const conflict = review.conflicts[0]!;
    expect(conflict.field.label).toBe("System prompt");
    expect(conflict.field.ours).toBe("Main edited prompt");
    expect(conflict.field.theirs).toBe("Branch edited prompt");
  });

  it("identical independent edits are compatible (not conflicts)", () => {
    const ours = makeConfig({ assistant: { systemPrompt: "Same edit both sides", assistantName: "Clara" } });
    const theirs = makeConfig({ assistant: { systemPrompt: "Same edit both sides", assistantName: "Clara" } });
    const review = buildMergeReview({
      base: branchBase, ours, theirs,
      baseVersionNumber: 3, oursVersionNumber: 4, theirsVersionNumber: 2,
      sourceBranch: { id: "b1", name: "b" }, targetBranch: { id: "main", name: "Main" },
    });
    expect(review.conflictCount).toBe(0);
  });
});

describe("applyMerge — explicit resolution", () => {
  const branchBase = makeConfig({ assistant: { systemPrompt: "Base prompt" } });

  it("applies clean incoming changes and honoured conflict resolutions", () => {
    const ours = makeConfig({ assistant: { systemPrompt: "Main edited prompt", assistantName: "Clara" } });
    const theirs = makeConfig({ assistant: { systemPrompt: "Branch edited prompt", assistantName: "Clara", welcomeMessage: "Vanakkam!" } });

    const mergedTheirs = applyMerge({ base: branchBase, ours, theirs, resolutions: [{ field: "assistant.systemPrompt", pick: "theirs" }] });
    expect(mergedTheirs.assistant.systemPrompt).toBe("Branch edited prompt");
    expect(mergedTheirs.assistant.welcomeMessage).toBe("Vanakkam!");

    const mergedOurs = applyMerge({ base: branchBase, ours, theirs, resolutions: [{ field: "assistant.systemPrompt", pick: "ours" }] });
    expect(mergedOurs.assistant.systemPrompt).toBe("Main edited prompt");
    // Clean change still applies regardless of the conflict resolution.
    expect(mergedOurs.assistant.welcomeMessage).toBe("Vanakkam!");
  });

  it("keeps the ours value for unresolved conflicts (service aborts before this)", () => {
    const ours = makeConfig({ assistant: { systemPrompt: "Main edited prompt" } });
    const theirs = makeConfig({ assistant: { systemPrompt: "Branch edited prompt" } });
    const merged = applyMerge({ base: branchBase, ours, theirs, resolutions: [] });
    expect(merged.assistant.systemPrompt).toBe("Main edited prompt");
  });
});
