/**
 * src/components/theme/apply-theme.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side theme application — the interactive counterpart of the blocking
 * THEME_INIT_SCRIPT (which owns first paint). Used by the header toggle.
 */
import { THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

/** Reads the theme actually applied to the document right now. */
export function getAppliedTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Applies + persists an explicit personal choice. Stored in localStorage, so
 * it wins over the platform default on every future visit (the init script
 * checks it before anything else).
 */
export function setUserThemePreference(pref: Exclude<ThemeMode, "system">): void {
  if (typeof document === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* Private mode / storage disabled — the visual flip still applies. */
  }
  document.documentElement.classList.toggle("dark", pref === "dark");
  document.documentElement.setAttribute("data-applied-theme", pref);
}
