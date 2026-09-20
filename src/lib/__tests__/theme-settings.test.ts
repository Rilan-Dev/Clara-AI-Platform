/**
 * src/lib/__tests__/theme-settings.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform default theme reads/writes — the behaviour that makes "admin sets
 * the default theme without restarting the app" work:
 *
 *   - stored value is normalised, with a safe light fallback;
 *   - reads are TTL-cached so the per-request layout read stays off Postgres;
 *   - DB outages degrade to light WITHOUT adding a failing query per render;
 *   - writes go through the shared platform settings writer and bust the
 *     cache immediately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ pool: { query: vi.fn() } }));
vi.mock("@/modules/phone/core/db", () => ({
  setPlatformEnvSetting: vi.fn(async () => undefined),
}));

import { pool } from "@/lib/db";
import { setPlatformEnvSetting } from "@/modules/phone/core/db";
import {
  getPlatformDefaultTheme,
  invalidatePlatformThemeCache,
  setPlatformDefaultTheme,
} from "@/lib/theme-settings";
import { PLATFORM_THEME_KEY } from "@/lib/theme";

const queryMock = vi.mocked(pool.query);
const setSettingMock = vi.mocked(setPlatformEnvSetting);

/** Rows returned by the targeted platform_env_settings SELECT. */
function mockStoredValue(value: string | null) {
  queryMock.mockImplementation(
    async () => ({ rows: value === null ? [] : [{ value }] }) as never,
  );
}

function mockQueryFailure() {
  queryMock.mockImplementation(
    () => Promise.reject(new Error("connection refused")) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  invalidatePlatformThemeCache();
  mockStoredValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getPlatformDefaultTheme — reads", () => {
  it("returns the stored mode", async () => {
    mockStoredValue("dark");
    await expect(getPlatformDefaultTheme()).resolves.toBe("dark");
  });

  it("normalises whitespace and casing", async () => {
    mockStoredValue("  DARK ");
    await expect(getPlatformDefaultTheme()).resolves.toBe("dark");
    invalidatePlatformThemeCache();

    mockStoredValue("System");
    await expect(getPlatformDefaultTheme()).resolves.toBe("system");
  });

  it("falls back to light when no row exists yet (fresh install)", async () => {
    mockStoredValue(null);
    await expect(getPlatformDefaultTheme()).resolves.toBe("light");
  });

  it("falls back to light when the stored value is invalid", async () => {
    mockStoredValue("neon-purple");
    await expect(getPlatformDefaultTheme()).resolves.toBe("light");
  });
});

describe("getPlatformDefaultTheme — caching", () => {
  it("serves repeated reads from the in-process cache", async () => {
    mockStoredValue("dark");
    await getPlatformDefaultTheme();
    await getPlatformDefaultTheme();
    await getPlatformDefaultTheme();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the TTL window expires (no restart needed)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    mockStoredValue("dark");
    await expect(getPlatformDefaultTheme()).resolves.toBe("dark");

    // Still inside the TTL — no second query.
    vi.setSystemTime(1_000_000 + 2_000);
    await expect(getPlatformDefaultTheme()).resolves.toBe("dark");
    expect(queryMock).toHaveBeenCalledTimes(1);

    // Past the TTL — the admin's new value is picked up.
    vi.setSystemTime(1_000_000 + 5_001);
    mockStoredValue("light");
    await expect(getPlatformDefaultTheme()).resolves.toBe("light");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("degrades to light when the DB is unreachable (render must not crash)", async () => {
    mockQueryFailure();
    await expect(getPlatformDefaultTheme()).resolves.toBe("light");
  });

  it("caches the fallback too — an outage adds no failing query per render", async () => {
    mockQueryFailure();
    await getPlatformDefaultTheme();
    await getPlatformDefaultTheme();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("setPlatformDefaultTheme — writes", () => {
  it("writes through the shared platform settings writer with the right key", async () => {
    await setPlatformDefaultTheme("dark", "11111111-1111-1111-1111-111111111111");
    expect(setSettingMock).toHaveBeenCalledWith(
      PLATFORM_THEME_KEY,
      "dark",
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("invalidates the cache so the writer's very next read is fresh", async () => {
    mockStoredValue("light");
    await expect(getPlatformDefaultTheme()).resolves.toBe("light");
    expect(queryMock).toHaveBeenCalledTimes(1);

    mockStoredValue("dark");
    await setPlatformDefaultTheme("dark");
    await expect(getPlatformDefaultTheme()).resolves.toBe("dark");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
