"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getAppliedTheme, setUserThemePreference } from "@/components/theme/apply-theme";

/**
 * Theme toggle — flips the CURRENT effective theme (light ⇄ dark) and
 * persists the choice in localStorage so it wins over the platform default
 * on every future visit.
 *
 * Rendered in the admin/workspace topbar, the public site header and the
 * login screen, so every surface can switch at any time. Rendered invisible
 * until mounted to avoid a hydration icon mismatch (the applied theme is
 * only knowable in the browser).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(getAppliedTheme() === "dark");
  }, []);

  function handleToggle() {
    const next = isDark ? "light" : "dark";
    setUserThemePreference(next);
    setIsDark(next === "dark");
  }

  const label = mounted
    ? isDark
      ? "Switch to light theme"
      : "Switch to dark theme"
    : "Toggle theme";

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        mounted ? "" : "invisible"
      } ${className}`}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" aria-hidden />
        ) : (
          <Moon className="h-4 w-4" aria-hidden />
        )
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}

export default ThemeToggle;
