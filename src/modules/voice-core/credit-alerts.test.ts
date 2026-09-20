/**
 * Unit tests for V6 credit-burn alerting (voice-core/credit-alerts.ts).
 *
 * Covers: threshold crossing detection, one-alert-per-(threshold, limit)
 * de-duplication, notification queuing, and never-throw discipline. The DB
 * layer is mocked so the accounting contracts run in CI without Postgres.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────

const queryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { evaluateCreditBurn } from "./credit-alerts";
import type { ElevenLabsSubscriptionInfo } from "./types";

function subscription(overrides: Partial<ElevenLabsSubscriptionInfo> = {}): ElevenLabsSubscriptionInfo {
  return {
    tier: "starter",
    characterCount: 50,
    characterLimit: 100,
    nextCharacterCountResetUnix: null,
    voiceLimit: 30,
    canUseInstantCloning: true,
    ...overrides,
  };
}

describe("evaluateCreditBurn", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT", "80");
    queryMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not alert while usage is below the threshold", async () => {
    const result = await evaluateCreditBurn(subscription({ characterCount: 50, characterLimit: 100 }));
    expect(result).toMatchObject({ thresholdPct: 80, usagePercent: 50, crossed: false, alerted: false });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("records and alerts when the threshold is crossed", async () => {
    // First insert (alert row) + admins lookup + notification inserts + notified update.
    queryMock.mockResolvedValueOnce([{ id: "alert-1" }]);   // INSERT ... RETURNING id
    queryMock.mockResolvedValue([]);                         // generic follow-ups

    const result = await evaluateCreditBurn(subscription({ characterCount: 85, characterLimit: 100 }));
    expect(result).toMatchObject({ usagePercent: 85, crossed: true, alerted: true });

    // The alert insert pins the (threshold, limit) pair.
    const insertSql = String(queryMock.mock.calls[0][0]);
    expect(insertSql).toContain("elevenlabs_credit_alerts");
    expect(queryMock.mock.calls[0][1]).toEqual([80, 85, 100]);
  });

  it("de-duplicates repeat crossings within the same billing period", async () => {
    // INSERT ... DO NOTHING returns no row → already alerted.
    queryMock.mockResolvedValueOnce([]);

    const result = await evaluateCreditBurn(subscription({ characterCount: 90, characterLimit: 100 }));
    expect(result).toMatchObject({ crossed: true, alerted: false });

    // The follow-up refreshes last_seen only.
    const refreshSql = String(queryMock.mock.calls[1][0]);
    expect(refreshSql).toContain("UPDATE elevenlabs_credit_alerts");
  });

  it("reports null usage when the account has no limit", async () => {
    const result = await evaluateCreditBurn(subscription({ characterCount: 0, characterLimit: 0 }));
    expect(result.usagePercent).toBeNull();
    expect(result.crossed).toBe(false);
  });

  it("never throws — accounting failures degrade to the evaluation only", async () => {
    queryMock.mockRejectedValue(new Error("db down"));
    const result = await evaluateCreditBurn(subscription({ characterCount: 85, characterLimit: 100 }));
    expect(result.crossed).toBe(true);
    expect(result.alerted).toBe(false);
  });
});
