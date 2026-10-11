import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const recordUsageMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
    fn({
      query: async (sql: string, params?: unknown[]) => ({
        rows: await queryMock(sql, params),
      }),
    }),
  ),
}));

vi.mock("@/lib/plan-guard", () => ({}));

import {
  checkMcpQuotaAdmission,
  withMcpAdmission,
  type QuotaCheck,
} from "./metering";
import type { McpEntitlements } from "./entitlements";
import type { PoolClient } from "pg";

const entitled: McpEntitlements = {
  enabled: true,
  customEndpoints: true,
  maxConnections: 10,
  maxToolsPerConnection: 100,
  maxAgentAssignments: 500,
  toolCallsPerPeriod: 1000,
  toolCallsPerMinute: 60,
  allowedAuthMethods: ["none", "bearer_token"],
  allowedTransports: ["streamable_http"],
  platformCatalog: true,
  privateNetwork: false,
  usagePolicy: "deny",
  notes: "",
};

function clientWithCounts(period: number, minute: number): PoolClient {
  return {
    query: async () => ({ rows: [{ period_used: period, minute_used: minute }] }),
  } as unknown as PoolClient;
}

describe("checkMcpQuotaAdmission — billing-period quota", () => {
  it("admits when usage is below the quota", async () => {
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(999, 0),
      "org-1",
      entitled,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(true);
  });

  it("denies when the deny policy quota is exhausted", async () => {
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(1000, 0),
      "org-1",
      entitled,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(false);
    if (!admission.allowed) {
      expect(admission.reason).toBe("PERIOD_QUOTA_EXHAUSTED");
      expect(admission.limit).toBe(1000);
    }
  });

  it("allows over-quota calls under the meter policy", async () => {
    const metered = { ...entitled, usagePolicy: "meter" as const };
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(5_000, 0),
      "org-1",
      metered,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(true);
  });

  it("unlimited quota (-1) never blocks on period usage", async () => {
    const unlimited = { ...entitled, toolCallsPerPeriod: -1 };
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(10_000_000, 0),
      "org-1",
      unlimited,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(true);
  });
});

describe("checkMcpQuotaAdmission — per-minute rate limit", () => {
  it("denies when the minute window is exhausted regardless of policy", async () => {
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(0, 60),
      "org-1",
      entitled,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(false);
    if (!admission.allowed) expect(admission.reason).toBe("RATE_LIMITED");
  });

  it("unlimited rate (-1) never blocks on minute usage", async () => {
    const unlimited = { ...entitled, toolCallsPerMinute: -1 };
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(0, 1_000_000),
      "org-1",
      unlimited,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(true);
  });

  it("rate limit takes precedence over the period quota message", async () => {
    const admission = await checkMcpQuotaAdmission(
      clientWithCounts(1_000, 60),
      "org-1",
      entitled,
      "2026-10-01",
    );
    expect(admission.allowed).toBe(false);
    if (!admission.allowed) expect(admission.reason).toBe("RATE_LIMITED");
  });
});

describe("withMcpAdmission — transactional admission wrapper", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("passes the admission decision to the caller under the org lock", async () => {
    queryMock.mockResolvedValue([{ period_used: 5, minute_used: 1 }]);
    const seen: QuotaCheck[] = [];
    const result = await withMcpAdmission("org-1", entitled, "2026-10-01", async (_client, admission) => {
      seen.push(admission);
      return "done";
    });
    expect(result).toBe("done");
    expect(seen[0]?.allowed).toBe(true);
    // The advisory lock was acquired before the count query, keyed to the
    // org's MCP admission domain.
    const lockCall = queryMock.mock.calls[0];
    expect(lockCall[0]).toContain("pg_advisory_xact_lock");
    expect(lockCall[1]?.[0]).toContain("mcp:");
  });

  it("surfaces denials so the caller can reject without executing", async () => {
    queryMock.mockResolvedValue([{ period_used: 1_000, minute_used: 0 }]);
    const admission = await withMcpAdmission("org-1", entitled, "2026-10-01", async (_c, a) => a);
    expect(admission.allowed).toBe(false);
  });
});
