"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

/**
 * Settings → Appearance — the platform admin's control over which theme NEW
 * visitors start with. Saving writes platform_env_settings.DEFAULT_THEME_MODE
 * via /api/platform/theme; the root layout re-reads that value on every
 * request (5s in-process cache), so the change goes live for new visitors
 * WITHOUT restarting the application.
 *
 * Everyone keeps a personal override: the header theme toggle stores a
 * localStorage preference that always beats this default.
 */

const MODE_OPTIONS: Array<{
  value: ThemeMode;
  icon: typeof Sun;
  title: string;
  description: string;
}> = [
  {
    value: "light",
    icon: Sun,
    title: "Light",
    description: "Bright and airy — the classic Clara look on a soft neutral base.",
  },
  {
    value: "dark",
    icon: Moon,
    title: "Dark",
    description: "Soft near-black surfaces with the same indigo → violet accents.",
  },
  {
    value: "system",
    icon: Monitor,
    title: "System",
    description: "Follow each visitor's device setting — light or dark automatically.",
  },
];

function isThemeMode(value: unknown): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value as string);
}

export function PlatformAppearancePanel() {
  const [mode, setMode] = useState<ThemeMode | null>(null);
  const [savedMode, setSavedMode] = useState<ThemeMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(apiUrl("/api/platform/theme"), {
        headers: withAuthHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as {
        defaultTheme?: unknown;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const loaded = isThemeMode(data.defaultTheme) ? data.defaultTheme : "light";
      setMode(loaded);
      setSavedMode(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the default theme.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!mode || saving) return;
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const res = await fetch(apiUrl("/api/platform/theme"), {
        method: "PUT",
        headers: withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ defaultTheme: mode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updatedAt?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSavedMode(mode);
      const when = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
      setSavedNote(`Saved at ${when} — new visitors will see the ${mode} theme on their next page load.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the default theme.");
    } finally {
      setSaving(false);
    }
  }

  const loading = mode === null;
  const dirty = mode !== null && savedMode !== null && mode !== savedMode;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Default theme for new visitors</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">
          Pick the mode the application renders on a visitor&apos;s first visit — before they have made a
          choice of their own.
        </p>

        {loading ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="h-28 rounded-xl bg-muted animate-pulse" />
            <div className="h-28 rounded-xl bg-muted animate-pulse" />
            <div className="h-28 rounded-xl bg-muted animate-pulse" />
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Default theme mode"
            className="mt-5 grid gap-3 sm:grid-cols-3"
          >
            {MODE_OPTIONS.map((opt) => {
              const selected = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(opt.value)}
                  className={`group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    selected
                      ? "border-primary/40 bg-primary/10 shadow-sm"
                      : "border-border bg-card hover:border-primary/25 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <opt.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent"
                      }`}
                      aria-hidden
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{opt.title}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground/80">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!mode || saving || !dirty}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save default theme"}
          </button>
          {savedNote && !dirty && !error && (
            <p className="text-xs text-muted-foreground/80">{savedNote}</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">How this works</h3>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground/90">
          <li className="flex gap-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <span>
              <strong className="font-medium text-foreground/90">Takes effect immediately</strong> — the
              server reads this setting on every page load, so there is no restart and no redeploy
              to wait for.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <span>
              <strong className="font-medium text-foreground/90">New visitors only</strong> — anyone who
              has already switched themes with the header toggle keeps their own choice.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <span>
              <strong className="font-medium text-foreground/90">Try it yourself</strong> — use the theme
              toggle in the top bar to preview light and dark; your personal choice is stored in
              this browser only.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default PlatformAppearancePanel;
