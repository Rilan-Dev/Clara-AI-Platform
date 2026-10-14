import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => ({ checked_at: "2026-10-14T06:00:00Z" })),
  execute: vi.fn(async () => ({ rowCount: 1 })),
  withTransaction: vi.fn(),
}));

vi.mock("@/modules/phone/core/db", () => ({ setPlatformEnvSetting: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn(async () => undefined),
  loadRuntimeSettingsOnStartup: vi.fn(async () => undefined),
}));
vi.mock("./live-catalog", () => ({ syncLiveProviderCatalog: vi.fn(async () => null) }));

import { queryOne } from "@/lib/db";
import { recordProviderHealth } from "./registry-db";

type InsertParams = [string, string, string, number | null, string | null, string | null];

function lastInsertParams(): InsertParams {
  const call = vi.mocked(queryOne).mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![1] as InsertParams;
}

describe("recordProviderHealth checked_by UUID guard", () => {
  it("coerces a non-UUID actor label to NULL instead of failing the insert", async () => {
    // The exact production failure: the ai-health cron passed "ai-health-cron"
    // and Postgres rejected the row with "invalid input syntax for type uuid",
    // which took the whole monitoring route (and its incident capture) down.
    await recordProviderHealth("openai", { status: "down", latencyMs: 42, errorMessage: "HTTP 401" }, "ai-health-cron");
    expect(lastInsertParams()[5]).toBeNull();
  });

  it("keeps a valid user UUID (trimmed)", async () => {
    const uuid = "  7e0d7a1e-2f60-4c64-9a5b-3a1f2c4d5e6f  ";
    const record = await recordProviderHealth("gemini", { status: "healthy", latencyMs: 12, errorMessage: null }, uuid);
    expect(lastInsertParams()[5]).toBe(uuid.trim());
    expect(record.checkedBy).toBe(uuid.trim());
  });

  it("passes NULL through unchanged", async () => {
    await recordProviderHealth("sarvam", { status: "healthy", latencyMs: 5, errorMessage: null }, null);
    expect(lastInsertParams()[5]).toBeNull();
  });
});
