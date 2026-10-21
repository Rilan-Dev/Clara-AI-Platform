import { describe, expect, it } from "vitest";
import { ADMIN_SETTINGS_PAGES, availableSettingsPages } from "./settings-nav";

describe("optional feature navigation", () => {
  it("hides widget and integration/MCP settings when disabled", () => {
    const pages = availableSettingsPages(ADMIN_SETTINGS_PAGES, {
      embeddableWidget: false, integrations: false,
    });
    const ids = pages.map((p) => p.id);
    expect(ids).toContain("account");
    expect(ids).toContain("ai");
    expect(ids).not.toContain("embed");
    expect(ids).not.toContain("integrations");
    expect(ids).not.toContain("mcp");
    expect(ids).not.toContain("mcpGovernance");
  });

  it("preserves both feature families unchanged in development", () => {
    const pages = availableSettingsPages(ADMIN_SETTINGS_PAGES, {
      embeddableWidget: true, integrations: true,
    });
    expect(pages).toHaveLength(ADMIN_SETTINGS_PAGES.length);
  });

  it("switches only the requested feature family", () => {
    const pages = availableSettingsPages(ADMIN_SETTINGS_PAGES, {
      embeddableWidget: true, integrations: false,
    });
    const ids = pages.map((p) => p.id);
    expect(ids).toContain("embed");
    expect(ids).not.toContain("mcp");
    expect(ids).toContain("payments");
  });
});
