/**
 * src/lib/theme.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared theme-mode contract (isomorphic — imported by the root layout, API
 * routes, the admin Appearance panel and the client toggle).
 *
 * How the theme system works:
 *
 *   1. PLATFORM DEFAULT — the platform admin picks the mode NEW visitors
 *      start with (Settings → Appearance). It is stored in
 *      platform_env_settings under DEFAULT_THEME_MODE and read on every
 *      request by the root layout (see lib/theme-settings.ts), so changing it
 *      reaches new visitors WITHOUT restarting or redeploying the app. The
 *      value is injected into <html data-default-theme="…">.
 *
 *   2. PERSONAL OVERRIDE — anyone can flip their own copy with the theme
 *      toggle in the header; the choice is persisted in localStorage
 *      ("clara-theme") and always wins over the platform default.
 *
 *   3. NO FLASH — THEME_INIT_SCRIPT is inlined as the first element of
 *      <body>; it resolves the effective mode and toggles the `.dark` class
 *      on <html> synchronously, before the browser paints anything.
 *
 *   4. EMBED SURFACES — /embed/* routes deliberately skip the platform
 *      default: embeddable widgets are customer-branded surfaces whose look
 *      is governed by each KB's embed design settings, not the platform
 *      theme. Only an explicit personal override applies there.
 */

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** localStorage key holding a user's explicit light/dark choice. */
export const THEME_STORAGE_KEY = "clara-theme";

/** platform_env_settings key holding the admin-chosen default mode. */
export const PLATFORM_THEME_KEY = "DEFAULT_THEME_MODE";

/** Fallback used whenever the stored setting is missing or invalid. */
export const DEFAULT_THEME_MODE: ThemeMode = "light";

/**
 * Normalises any stored / admin-supplied value into a valid theme mode.
 * Returns null for anything that is not light / dark / system so callers
 * can decide their own fallback.
 */
export function normalizeThemeMode(value: unknown): ThemeMode | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return (THEME_MODES as readonly string[]).includes(trimmed)
    ? (trimmed as ThemeMode)
    : null;
}

/**
 * Blocking inline script rendered as the first child of <body>. Runs before
 * first paint and applies, in priority order:
 *
 *   personal override (localStorage)  →  platform default (data-default-theme)
 *   →  "light"
 *
 * Plain ES5 on purpose — it must execute in every browser the platform
 * supports, with zero dependencies, before any hydration happens.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var KEY = "clara-theme";
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) {}
    var mode = stored === "light" || stored === "dark"
      ? stored
      : (location.pathname.indexOf("/embed/") === 0
          ? "light"
          : (root.getAttribute("data-default-theme") || "light"));
    if (mode !== "light" && mode !== "dark" && mode !== "system") mode = "light";
    var prefersDark = false;
    try {
      prefersDark = !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) {}
    var apply = function (dark) {
      root.classList.toggle("dark", dark);
      root.setAttribute("data-applied-theme", dark ? "dark" : "light");
    };
    apply(mode === "dark" || (mode === "system" && prefersDark));
    // "System" default tracks the OS live — but an explicit personal choice
    // (localStorage) always wins, so the listener re-checks it on every flip.
    if (mode === "system" && window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        try {
          var s = localStorage.getItem(KEY);
          if (s === "light" || s === "dark") return;
        } catch (e) {}
        apply(mq.matches);
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  } catch (e) {}
})();`;
