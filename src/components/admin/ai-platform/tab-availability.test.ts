import { describe, expect, it } from "vitest";
import { effectiveAiPlatformTab, type AiPlatformTab } from "./tab-availability";

describe("AI Platform tab rendering when optional integrations toggle", () => {
  const otherTabs: AiPlatformTab[] = [
    "overview", "providers", "tools", "agent-loop", "verification",
  ];

  it("renders the overview when the previously selected integration tab is disabled", () => {
    expect(effectiveAiPlatformTab("integrations", false)).toBe("overview");
  });

  it("keeps the integration view fully functional in development", () => {
    expect(effectiveAiPlatformTab("integrations", true)).toBe("integrations");
  });

  it.each(otherTabs)("does not redirect shared %s panels", (tab) => {
    expect(effectiveAiPlatformTab(tab, false)).toBe(tab);
    expect(effectiveAiPlatformTab(tab, true)).toBe(tab);
  });

  it("restores the selected integration tab if availability returns during the same session", () => {
    const selected: AiPlatformTab = "integrations";
    expect(effectiveAiPlatformTab(selected, false)).toBe("overview");
    expect(effectiveAiPlatformTab(selected, true)).toBe("integrations");
  });
});
