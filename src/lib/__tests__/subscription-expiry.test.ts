/**
 * src/lib/__tests__/subscription-expiry.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription lifecycle sweep — reminder routing and expiry handling.
 *
 * The sweep must send the right reminder for the right subscription state:
 *
 *   - ACTIVE sub ending within 7 days  → renewal_reminder
 *   - TRIALING sub ending within 3 days → trial_ending_soon (the dedicated
 *     trial template — previously this was dead and trials got the
 *     renewal-style warning instead)
 *   - TRIALING sub ending in > 3 days  → nothing (don't nag trials early)
 *   - Sub past its end date            → past_due + subscription_expired
 *   - Already notified this period     → deduped, no second email
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ query: vi.fn(async () => []) }));

vi.mock("@/lib/subscription-notifications", () => ({
  queueNotification: vi.fn(async () => "n-1"),
  writeSubscriptionAudit: vi.fn(async () => undefined),
  getOrgOwnerEmail: vi.fn(async () => "owner@acme.example"),
}));

import { query } from "@/lib/db";
import { queueNotification } from "@/lib/subscription-notifications";
import { sweepSubscriptionExpiry } from "@/lib/subscription-expiry";

const queryMock = vi.mocked(query);
const queueMock = vi.mocked(queueNotification);

const DAY = 86_400_000;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

type SubFixture = {
  org_id: string;
  org_name: string;
  plan_id: string;
  plan_name: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
};

function subFixture(overrides: Partial<SubFixture> & { status: string; endsInDays: number }): SubFixture {
  return {
    org_id: "org-1",
    org_name: "Acme",
    plan_id: "plan-pro",
    plan_name: "Pro",
    current_period_start: iso(-30 * DAY),
    current_period_end: iso(overrides.endsInDays * DAY),
    ...overrides,
  };
}

/** Route the query mock by SQL shape. */
function givenSubs(subs: SubFixture[], alreadyNotified = false) {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM org_subscriptions os") && sql.includes("scheduled_plan_id IS NOT NULL")) return [];
    if (sql.includes("FROM subscription_notifications")) return alreadyNotified ? [{ id: "x" }] : [];
    if (sql.includes("FROM org_subscriptions os")) return subs;
    return [];
  });
}

function queuedTypes(): string[] {
  return queueMock.mock.calls.map(([payload]) => (payload as { type: string }).type);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── Reminder routing ──────────────────────────────────────────────────────────

describe("sweepSubscriptionExpiry — reminder routing", () => {
  it("sends renewal_reminder to active subs ending within 7 days", async () => {
    givenSubs([subFixture({ status: "active", endsInDays: 5 })]);

    const result = await sweepSubscriptionExpiry();

    expect(queuedTypes()).toEqual(["renewal_reminder"]);
    expect(result.reminded).toBe(1);
    expect(result.trialReminded).toBe(0);
    expect(result.expired).toBe(0);
  });

  it("sends trial_ending_soon to trialing subs ending within 3 days", async () => {
    givenSubs([subFixture({ status: "trialing", endsInDays: 2 })]);

    const result = await sweepSubscriptionExpiry();

    expect(queuedTypes()).toEqual(["trial_ending_soon"]);
    expect(result.trialReminded).toBe(1);
    expect(result.reminded).toBe(0);

    // The trial template gets the remaining-days context it interpolates.
    const data = (queueMock.mock.calls[0]![0] as { data: Record<string, string> }).data;
    expect(data.planName).toBe("Pro");
    expect(data.trialDays).toBe("2");
  });

  it("does not nag trials earlier than 3 days out", async () => {
    givenSubs([subFixture({ status: "trialing", endsInDays: 5 })]);

    const result = await sweepSubscriptionExpiry();

    expect(queuedTypes()).toEqual([]);
    expect(result.trialReminded).toBe(0);
    expect(result.reminded).toBe(0);
  });

  it("leaves subs with plenty of runway alone", async () => {
    givenSubs([
      subFixture({ status: "active", endsInDays: 12 }),
      subFixture({ org_id: "org-2", status: "trialing", endsInDays: 9 }),
    ]);

    const result = await sweepSubscriptionExpiry();

    expect(queuedTypes()).toEqual([]);
    expect(result.checked).toBe(2);
  });

  it("dedupes — an already notified period is not reminded again", async () => {
    givenSubs([subFixture({ status: "active", endsInDays: 5 })], true);

    const result = await sweepSubscriptionExpiry();

    expect(queuedTypes()).toEqual([]);
    expect(result.reminded).toBe(0);
  });
});

// ── Expiry ────────────────────────────────────────────────────────────────────

describe("sweepSubscriptionExpiry — expiry", () => {
  it("moves past-end subs to past_due and emails subscription_expired", async () => {
    givenSubs([subFixture({ status: "active", endsInDays: -1 })]);

    const result = await sweepSubscriptionExpiry();

    expect(queuedTypes()).toEqual(["subscription_expired"]);
    expect(result.expired).toBe(1);

    const update = queryMock.mock.calls.find(([sql]) => sql.includes("SET status = 'past_due'"));
    expect(update).toBeTruthy();
    expect(update![1]).toContain("org-1");
  });

  it("reports per-org errors without failing the whole sweep", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions os") && !sql.includes("scheduled_plan_id")) {
        throw new Error("connection reset");
      }
      return [];
    });

    const result = await sweepSubscriptionExpiry();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("connection reset");
  });
});
