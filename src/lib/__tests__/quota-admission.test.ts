import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * WS-1.3: quota middleware unit validation — the CI half of the plan-by-plan
 * validation matrix. (The live plan-tier walk lives in scripts/e2e-plan-limits.js
 * against a running server; these tests pin the admission contract itself.)
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

type PlanLimitsFixture = {
  plan_id?: string;
  plan_name?: string;
  status?: string;
  downgraded?: boolean;
  max_kbs?: number;
  max_docs_per_kb?: number;
  max_req_day?: number;
  max_storage_mb?: number;
  voice_enabled?: boolean;
  api_access?: boolean;
  custom_branding?: boolean;
  sso_enabled?: boolean;
};

let limitsFixture: PlanLimitsFixture = {};
let windowCount = 0;

vi.mock("@/lib/plan-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plan-guard")>();
  return {
    ...actual,
    resolveOrgPlanLimits: vi.fn(async (_orgId: string) => ({
      plan_id: "starter",
      plan_name: "Starter",
      status: "active",
      downgraded: false,
      max_kbs: 5,
      max_docs_per_kb: 100,
      max_req_day: 50,
      max_storage_mb: 500,
      voice_enabled: true,
      api_access: true,
      custom_branding: false,
      sso_enabled: false,
      ...limitsFixture,
    })),
  };
});

vi.mock("@/lib/db", () => ({
  withTransaction: vi.fn(async (fn: (tx: FakeTx) => Promise<unknown>) => {
    return fn({
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (sql.includes("COUNT(*)")) return { rows: [{ count: windowCount }] };
        if (sql.includes("INSERT INTO query_events")) return { rows: [{ id: "evt-1" }] };
        return { rows: [] };
      }),
    } as unknown as FakeTx);
  }),
  query: vi.fn(async () => []),
}));

const logQueryEventMock = vi.fn(async (_opts: unknown) => "evt-fallback");
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logQueryEvent: (opts: unknown) => logQueryEventMock(opts),
}));

type FakeTx = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";

const INPUT = {
  orgId: "11111111-1111-1111-1111-111111111111",
  kbId: "22222222-2222-2222-2222-222222222222",
  queryText: "What does my policy cover?",
  surface: "workspace" as const,
};

beforeEach(() => {
  limitsFixture = {};
  windowCount = 0;
  vi.mocked(logQueryEventMock).mockClear();
});

afterEach(() => {
  delete process.env.PLAN_GUARD_FAIL_MODE;
});

// ── Admission contract ────────────────────────────────────────────────────────

describe("admitQueryEvent — 402 contract", () => {
  it("admits and returns the pending event id when under the limit", async () => {
    windowCount = 10;
    limitsFixture = { max_req_day: 50 };
    const result = await admitQueryEvent(INPUT);
    expect(result.admitted).toBe(true);
    if (result.admitted) {
      expect(result.eventId).toBe("evt-1");
      expect(result.used).toBe(11);
      expect(result.limit).toBe(50);
    }
  });

  it("refuses with the 402 plan_limit_exceeded contract at the limit", async () => {
    windowCount = 50;
    limitsFixture = { max_req_day: 50 };
    const result = await admitQueryEvent(INPUT);
    expect(result.admitted).toBe(false);
    if (!result.admitted) {
      expect(result.limitKey).toBe("max_req_day");
      expect(result.current).toBe(50);
      expect(result.limit).toBe(50);
      expect(result.reason).toContain("Starter");
      expect(result.reason).toContain("50");
    }
  });

  it("the denial response carries the machine-readable upgrade contract", async () => {
    windowCount = 50;
    limitsFixture = { max_req_day: 50 };
    const result = await admitQueryEvent(INPUT);
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error("expected denial");
    if (!result.admitted) {
      const res = admissionDeniedResponse(result);
      expect(res.status).toBe(402);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.code).toBe("plan_limit_exceeded");
      expect(body.limitKey).toBe("max_req_day");
      expect(body.current).toBe(50);
      expect(body.limit).toBe(50);
      expect(body.upgradeUrl).toBe("/pricing");
    }
  });

  it("one credit left: exactly one more request is admitted, the next refused", async () => {
    windowCount = 49;
    limitsFixture = { max_req_day: 50 };
    const first = await admitQueryEvent(INPUT);
    expect(first.admitted).toBe(true);
    // The admitted request committed its row — the next count sees 50.
    windowCount = 50;
    const second = await admitQueryEvent(INPUT);
    expect(second.admitted).toBe(false);
  });

  it("unlimited plans (-1) always admit and still audit", async () => {
    windowCount = 1_000_000;
    limitsFixture = { max_req_day: -1 };
    const result = await admitQueryEvent(INPUT);
    expect(result.admitted).toBe(true);
    if (result.admitted) {
      expect(result.eventId).toBe("evt-1");
      expect(result.limit).toBe(-1);
    }
  });
});

// ── 80% soft warning ──────────────────────────────────────────────────────────

describe("admitQueryEvent — 80% soft warning", () => {
  it("fires the warning exactly on the crossing request (not before, not after)", async () => {
    limitsFixture = { max_req_day: 50 }; // 80% crossing = the 40th request
    windowCount = 38;                     // 39th request — below the threshold
    expect(((await admitQueryEvent(INPUT)) as { warning: unknown }).warning).toBeNull();
    windowCount = 39;                     // 40th request — crosses 80%
    const crossing = await admitQueryEvent(INPUT);
    expect((crossing as { warning: unknown }).warning).not.toBeNull();
    const warn = (crossing as { warning: { used: number; limit: number; pct: number } }).warning;
    expect(warn.used).toBe(40);
    expect(warn.limit).toBe(50);
    expect(warn.pct).toBe(80);
    windowCount = 40;                     // 41st request — already past the crossing
    expect(((await admitQueryEvent(INPUT)) as { warning: unknown }).warning).toBeNull();
  });

  it("rounds the threshold down so odd limits warn at or below 80%", async () => {
    limitsFixture = { max_req_day: 33 }; // floor(0.8 * 33) = 26
    windowCount = 25;
    const result = await admitQueryEvent(INPUT);
    expect((result as { warning: unknown }).warning).not.toBeNull();
  });
});

// ── Degraded subscription semantics ───────────────────────────────────────────

describe("admitQueryEvent — downgraded subscriptions", () => {
  it("denial copy explains that free-plan limits apply when downgraded", async () => {
    windowCount = 100;
    limitsFixture = { max_req_day: 100, plan_name: "Pro", downgraded: true, status: "past_due" };
    const result = await admitQueryEvent(INPUT);
    if (!result.admitted) {
      expect(result.reason).toContain("not active");
      expect(result.reason).toContain("free-plan limits apply");
    } else {
      throw new Error("expected denial under free limits");
    }
  });
});

// ── No-org fallback ───────────────────────────────────────────────────────────

describe("admitQueryEvent — org-less requests", () => {
  it("audits without quota when the org cannot be resolved", async () => {
    const result = await admitQueryEvent({ ...INPUT, orgId: null });
    expect(result.admitted).toBe(true);
    // The org-less branch logs the audit row via the non-transactional
    // logger — quota attribution is simply absent (no org to charge).
    expect(vi.mocked(logQueryEventMock)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logQueryEventMock).mock.calls[0]?.[0]).toMatchObject({ orgId: null });
  });
});

// ── Fail-mode ─────────────────────────────────────────────────────────────────

describe("admitQueryEvent — PLAN_GUARD_FAIL_MODE", () => {
  it("fails open by default when the DB transaction errors (audit still logged)", async () => {
    const { withTransaction } = await import("@/lib/db");
    vi.mocked(withTransaction).mockRejectedValueOnce(new Error("db down"));
    const result = await admitQueryEvent(INPUT);
    expect(result.admitted).toBe(true);
    expect(vi.mocked(logQueryEventMock)).toHaveBeenCalledTimes(1);
  });

  it("fails CLOSED with a refusal when PLAN_GUARD_FAIL_MODE=closed", async () => {
    process.env.PLAN_GUARD_FAIL_MODE = "closed";
    const { withTransaction } = await import("@/lib/db");
    vi.mocked(withTransaction).mockRejectedValueOnce(new Error("db down"));
    const result = await admitQueryEvent(INPUT);
    expect(result.admitted).toBe(false);
    if (!result.admitted) {
      expect(result.limitKey).toBe("plan_guard_unavailable");
    }
  });
});
