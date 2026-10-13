/**
 * src/modules/mcp/metering.ts
 *
 * Usage metering, billing-period quotas and per-minute rate limits for MCP
 * tool invocations.
 *
 * Concurrency safety:
 *   - Quota admission happens inside the caller's transaction under the same
 *     per-organisation advisory lock used by the integrations slot boundary,
 *     so concurrent invocations cannot both pass the count check.
 *   - The meter insert is a plain append; counts are always derived from
 *     committed rows, so an aborted invocation never silently decrements.
 *
 * Usage policy semantics (centralized):
 *   - "deny":  reject the invocation when the billing-period quota is
 *              exhausted (fail closed).
 *   - "meter": record usage and allow the call even beyond the configured
 *              quota (no overage billing exists yet — the count is still
 *              surfaced to the org and platform admin).
 *   - The per-minute rate limit is always a hard cap regardless of policy.
 */

import { query, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import type { McpEntitlements } from "./entitlements";

export type MeteredSurface = "chat" | "realtime" | "embed" | "api";

export type QuotaCheck =
  | { allowed: true; periodUsed: number; minuteUsed: number }
  | {
      allowed: false;
      reason: "PERIOD_QUOTA_EXHAUSTED" | "RATE_LIMITED";
      message: string;
      periodUsed: number;
      minuteUsed: number;
      limit: number;
    };

export type MeterRecord = {
  orgId: string;
  agentId: string | null;
  connectionId: string | null;
  toolId: string | null;
  toolName: string;
  userId: string | null;
  surface: MeteredSurface;
  success: boolean;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  periodStart: string;
};

const RATE_WINDOW_SECONDS = 60;

function minuteFloor(): string {
  const now = new Date();
  return new Date(
    Math.floor(now.getTime() / (RATE_WINDOW_SECONDS * 1000)) * RATE_WINDOW_SECONDS * 1000,
  ).toISOString();
}

/**
 * Check quota admission for one invocation. Runs inside the provided
 * transaction client so the advisory lock held by the caller serializes
 * concurrent admissions for the same organisation.
 */
export async function checkMcpQuotaAdmission(
  client: PoolClient,
  orgId: string,
  entitlements: McpEntitlements,
  periodStart: string,
): Promise<QuotaCheck> {
  const counts = await client.query<{ period_used: number; minute_used: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE period_start = $2::date)::int AS period_used,
       COUNT(*) FILTER (WHERE metered_at >= $3::timestamptz)::int AS minute_used
     FROM mcp_tool_usage_log
    WHERE org_id = $1`,
    [orgId, periodStart, minuteFloor()],
  );
  const periodUsed = counts.rows[0]?.period_used ?? 0;
  const minuteUsed = counts.rows[0]?.minute_used ?? 0;

  if (
    entitlements.toolCallsPerMinute !== -1 &&
    minuteUsed >= entitlements.toolCallsPerMinute
  ) {
    return {
      allowed: false,
      reason: "RATE_LIMITED",
      message: `MCP rate limit reached (${entitlements.toolCallsPerMinute} calls/minute). Retry shortly.`,
      periodUsed,
      minuteUsed,
      limit: entitlements.toolCallsPerMinute,
    };
  }

  if (
    entitlements.usagePolicy === "deny" &&
    entitlements.toolCallsPerPeriod !== -1 &&
    periodUsed >= entitlements.toolCallsPerPeriod
  ) {
    return {
      allowed: false,
      reason: "PERIOD_QUOTA_EXHAUSTED",
      message: `MCP tool-call quota for this billing period is exhausted (${entitlements.toolCallsPerPeriod}).`,
      periodUsed,
      minuteUsed,
      limit: entitlements.toolCallsPerPeriod,
    };
  }

  return { allowed: true, periodUsed, minuteUsed };
}

/** Append one metering row. Safe to call outside the admission transaction. */
export async function recordMcpUsage(record: MeterRecord): Promise<void> {
  await query(
    `INSERT INTO mcp_tool_usage_log
       (org_id, agent_id, connection_id, tool_id, tool_name, user_id, surface,
        success, duration_ms, error_code, error_message, period_start)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date)`,
    [
      record.orgId,
      record.agentId,
      record.connectionId,
      record.toolId,
      record.toolName,
      record.userId,
      record.surface,
      record.success,
      Math.max(0, Math.min(record.durationMs, 600_000)),
      record.errorCode,
      record.errorMessage,
      record.periodStart,
    ],
  );
}

export type McpUsageSummary = {
  connections: number;
  activeConnections: number;
  toolsApproved: number;
  agentAssignments: number;
  toolCallsThisPeriod: number;
  toolCallsLast24h: number;
  failedCallsThisPeriod: number;
};

/**
 * Real usage counters for entitlement/usage displays. Only committed rows are
 * counted — no fabricated or projected numbers.
 */
export async function getMcpUsageSummary(
  orgId: string,
  periodStart: string,
): Promise<McpUsageSummary> {
  const [connRows, toolRows, grantRows, usageRows] = await Promise.all([
    query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'active')::int AS active
         FROM org_mcp_connections
        WHERE org_id = $1`,
      [orgId],
    ),
    query<{ approved: number }>(
      `SELECT COUNT(*)::int AS approved
         FROM org_mcp_tools
        WHERE org_id = $1 AND approved = TRUE AND status = 'approved'`,
      [orgId],
    ),
    query<{ grants: number }>(
      `SELECT COUNT(*)::int AS grants
         FROM org_mcp_agent_grants
        WHERE org_id = $1 AND enabled = TRUE`,
      [orgId],
    ),
    query<{ period_calls: number; day_calls: number; failed_calls: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE period_start = $2::date)::int AS period_calls,
         COUNT(*) FILTER (WHERE metered_at >= now() - INTERVAL '24 hours')::int AS day_calls,
         COUNT(*) FILTER (WHERE period_start = $2::date AND success = FALSE)::int AS failed_calls
       FROM mcp_tool_usage_log
      WHERE org_id = $1`,
      [orgId, periodStart],
    ),
  ]);

  return {
    connections: connRows[0]?.total ?? 0,
    activeConnections: connRows[0]?.active ?? 0,
    toolsApproved: toolRows[0]?.approved ?? 0,
    agentAssignments: grantRows[0]?.grants ?? 0,
    toolCallsThisPeriod: usageRows[0]?.period_calls ?? 0,
    toolCallsLast24h: usageRows[0]?.day_calls ?? 0,
    failedCallsThisPeriod: usageRows[0]?.failed_calls ?? 0,
  };
}

/**
 * Organization-level advisory lock for MCP admission. Callers hold this lock
 * across the count-then-insert sequence for quota admission, mirroring the
 * integrations slot pattern.
 */
export async function acquireOrgMcpLock(
  client: PoolClient,
  orgId: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `mcp:${orgId}`,
  ]);
}

/** Convenience wrapper for admission + meter inside one transaction. */
export async function withMcpAdmission<T>(
  orgId: string,
  entitlements: McpEntitlements,
  periodStart: string,
  fn: (client: PoolClient, admission: QuotaCheck) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await acquireOrgMcpLock(client, orgId);
    const admission = await checkMcpQuotaAdmission(
      client,
      orgId,
      entitlements,
      periodStart,
    );
    return fn(client, admission);
  });
}