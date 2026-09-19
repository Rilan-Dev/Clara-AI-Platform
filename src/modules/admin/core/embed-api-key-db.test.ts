/**
 * src/modules/admin/core/embed-api-key-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * resolveLandingEmbedKey priority contract — the landing demo must render the
 * KB the platform admin pointed NEXT_PUBLIC_LANDING_EMBED_API_KEY at, never
 * silently fall back to the static seeded demo key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  queryOne: vi.fn(async () => null),
  execute: vi.fn(async () => undefined),
}));

import { queryOne } from "@/lib/db";
import { resolveLandingEmbedKey } from "./embed-api-key-db";

const queryOneMock = vi.mocked(queryOne);

/**
 * Deterministic DB stub keyed on the SQL text (the resolver issues two
 * DISTINCT queries — platform_env_settings lookup and the legacy
 * embed_api_key lookup — so dispatching on SQL is order-independent).
 */
function mockDb(opts: { setting?: string | null; legacy?: string | null }) {
  queryOneMock.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes("platform_env_settings")) {
      return opts.setting ? { value: opts.setting } : null;
    }
    if (text.includes("embed_api_key")) {
      return opts.legacy ? { key: opts.legacy } : null;
    }
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY;
  mockDb({});
});

describe("resolveLandingEmbedKey — priority", () => {
  it("prefers the admin-managed platform setting over everything else", async () => {
    mockDb({ setting: "clr_admin_setting_key", legacy: "clr_legacy_seeded_key" });
    process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY = "clr_env_var_key";

    const r = await resolveLandingEmbedKey();
    expect(r).toEqual({ key: "clr_admin_setting_key", source: "platform_setting" });
  });

  it("falls back to the deployment env var when no setting row exists", async () => {
    mockDb({ setting: null, legacy: "clr_legacy_seeded_key" });
    process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY = "clr_env_var_key";

    const r = await resolveLandingEmbedKey();
    expect(r).toEqual({ key: "clr_env_var_key", source: "env" });
  });

  it("uses the legacy seeded key only as a last resort (and says so)", async () => {
    mockDb({ setting: null, legacy: "clr_legacy_seeded_key" });

    const r = await resolveLandingEmbedKey();
    expect(r).toEqual({ key: "clr_legacy_seeded_key", source: "legacy_key" });
  });

  it("returns an empty key when nothing is configured anywhere", async () => {
    mockDb({ setting: null, legacy: null });

    const r = await resolveLandingEmbedKey();
    expect(r).toEqual({ key: "", source: null });
  });

  it("ignores a blank setting row (spaces only) and keeps walking the chain", async () => {
    mockDb({ setting: "   ", legacy: "clr_legacy_seeded_key" });

    const r = await resolveLandingEmbedKey();
    expect(r).toEqual({ key: "clr_legacy_seeded_key", source: "legacy_key" });
  });

  it("survives a platform_env_settings lookup failure (pre-migration boot)", async () => {
    queryOneMock.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes("platform_env_settings")) {
        throw new Error("relation does not exist");
      }
      if (text.includes("embed_api_key")) {
        return { key: "clr_legacy_seeded_key" };
      }
      return null;
    });

    const r = await resolveLandingEmbedKey();
    expect(r).toEqual({ key: "clr_legacy_seeded_key", source: "legacy_key" });
  });
});
