/**
 * src/lib/theme-settings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side access to the platform default theme mode.
 *
 * The value lives in platform_env_settings (key: DEFAULT_THEME_MODE) so a
 * platform admin can change it from Settings → Appearance at ANY time — it is
 * read on every request, which is exactly what makes "set the default theme
 * without restarting the application" work.
 *
 * The root layout calls getPlatformDefaultTheme() per render; a tiny
 * in-process TTL cache keeps Postgres out of the hot path while still picking
 * admin changes up within seconds.
 *
 * Server-only: imports the pg pool — never pull this into a client bundle.
 */
import { pool } from "@/lib/db";
import { setPlatformEnvSetting } from "@/modules/phone/core/db";
import {
  DEFAULT_THEME_MODE,
  normalizeThemeMode,
  PLATFORM_THEME_KEY,
  type ThemeMode,
} from "@/lib/theme";

const CACHE_TTL_MS = 5_000;

let cached: { value: ThemeMode; expiresAt: number } | null = null;

/** Drop the cached value — called after writes (and from tests). */
export function invalidatePlatformThemeCache(): void {
  cached = null;
}

/** Current platform default theme mode; never throws, never null. */
export async function getPlatformDefaultTheme(): Promise<ThemeMode> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const { rows } = await pool.query<{ value: string | null }>(
      "SELECT value FROM platform_env_settings WHERE key = $1",
      [PLATFORM_THEME_KEY],
    );
    const value = normalizeThemeMode(rows[0]?.value ?? null) ?? DEFAULT_THEME_MODE;
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (err) {
    console.warn(
      "[theme] platform default theme could not be read:",
      (err as Error).message,
    );
    // Cache the fallback too — a DB outage must not add a failing query to
    // every render. The next attempt happens after the same TTL.
    cached = { value: DEFAULT_THEME_MODE, expiresAt: now + CACHE_TTL_MS };
    return DEFAULT_THEME_MODE;
  }
}

/**
 * Persist a new platform default. Callers are expected to have already
 * validated the mode (the API route normalises input before this runs).
 * Writing through setPlatformEnvSetting keeps a single write path with
 * updated_at / updated_by bookkeeping.
 */
export async function setPlatformDefaultTheme(
  mode: ThemeMode,
  updatedBy?: string | null,
): Promise<void> {
  await setPlatformEnvSetting(PLATFORM_THEME_KEY, mode, updatedBy ?? null);
  // The writer sees the new value immediately; other requests follow within
  // the TTL anyway, but there is no reason to serve them stale on this node.
  invalidatePlatformThemeCache();
}
