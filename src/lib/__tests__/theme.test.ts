/**
 * src/lib/__tests__/theme.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Theme-mode contract — normalisation of stored/admin values, and the shape of
 * the blocking init script the root layout inlines before first paint.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_MODE,
  normalizeThemeMode,
  PLATFORM_THEME_KEY,
  THEME_INIT_SCRIPT,
  THEME_MODES,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

describe("normalizeThemeMode", () => {
  it("accepts the three canonical modes", () => {
    for (const mode of THEME_MODES) {
      expect(normalizeThemeMode(mode)).toBe(mode);
    }
  });

  it("trims and lower-cases whatever was stored", () => {
    expect(normalizeThemeMode("  DARK  ")).toBe("dark");
    expect(normalizeThemeMode("Light")).toBe("light");
    expect(normalizeThemeMode("\tSystem\n")).toBe("system");
  });

  it("rejects everything else with null so callers apply their own fallback", () => {
    const bad: unknown[] = ["blue", "", "   ", "lightdark", "0", null, undefined, 42, {}, []];
    for (const value of bad) {
      expect(normalizeThemeMode(value)).toBeNull();
    }
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("checks the personal override before the platform default", () => {
    // The script binds the shared storage key once and reads it for the
    // override resolution + the system-mode listener guard.
    expect(THEME_INIT_SCRIPT).toContain(`var KEY = "${THEME_STORAGE_KEY}"`);
    expect(THEME_INIT_SCRIPT).toContain("localStorage.getItem(KEY)");
  });

  it("falls back to the server-injected platform default", () => {
    expect(THEME_INIT_SCRIPT).toContain("data-default-theme");
  });

  it("resolves system mode against the OS colour-scheme preference", () => {
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme");
  });

  it("keeps embeddable /embed/* widget surfaces on the light default", () => {
    expect(THEME_INIT_SCRIPT).toContain('"/embed/"');
  });

  it("toggles the dark class in BOTH directions (never hardcodes one mode)", () => {
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("dark"');
    expect(THEME_INIT_SCRIPT).not.toContain('classList.add("dark")');
  });

  it("contains no un-expanded template placeholders", () => {
    expect(THEME_INIT_SCRIPT).not.toContain("${");
  });
});

describe("shared contract keys", () => {
  it("declares the exact storage and platform-setting keys", () => {
    expect(THEME_STORAGE_KEY).toBe("clara-theme");
    expect(PLATFORM_THEME_KEY).toBe("DEFAULT_THEME_MODE");
    expect(DEFAULT_THEME_MODE).toBe("light");
  });
});
