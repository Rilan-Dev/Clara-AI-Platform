import { describe, expect, it } from "vitest";
import { ADMIN_SETTINGS_PAGES, availableSettingsPages, shouldRedirectSettingsSection } from "./settings-nav";

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


describe("settings deep-link access while deployment flags load", () => {
  const none = { embeddableWidget: false, integrations: false };
  const all = { embeddableWidget: true, integrations: true };
  const disabled = availableSettingsPages(ADMIN_SETTINGS_PAGES, none);
  const enabled = availableSettingsPages(ADMIN_SETTINGS_PAGES, all);

  it("never redirects a legitimate development deep link before the feature response", () => {
    expect(shouldRedirectSettingsSection("embed", disabled, true, false)).toBe(false);
    expect(shouldRedirectSettingsSection("integrations", disabled, true, false)).toBe(false);
    expect(shouldRedirectSettingsSection("mcp", disabled, true, false)).toBe(false);
    expect(shouldRedirectSettingsSection("mcpGovernance", disabled, true, false)).toBe(false);
  });

  it("keeps enabled development pages after flags resolve", () => {
    for (const section of ["embed", "integrations", "mcp", "mcpGovernance"] as const) {
      expect(shouldRedirectSettingsSection(section, enabled, true, true)).toBe(false);
    }
  });

  it("redirects disabled production deep links only after flags resolve", () => {
    for (const section of ["embed", "integrations", "mcp", "mcpGovernance"] as const) {
      expect(shouldRedirectSettingsSection(section, disabled, true, true)).toBe(true);
    }
  });

  it("does not redirect before authentication resolves and keeps core settings intact", () => {
    expect(shouldRedirectSettingsSection("embed", disabled, false, true)).toBe(false);
    for (const section of ["account", "ai", "phone", "payments", "email"] as const) {
      expect(shouldRedirectSettingsSection(section, disabled, true, true)).toBe(false);
    }
  });
});
