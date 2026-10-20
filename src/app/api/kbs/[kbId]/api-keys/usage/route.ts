/**
 * GET /api/kbs/[kbId]/api-keys/usage
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage analytics dashboard endpoint for the Deploy tab.
 *
 * Returns:
 *   quota        — org-level daily quota status (current / limit / plan)
 *   keys         — per-key usage breakdown (thisHour, last24h, last7d, last30d)
 *   hourly       — last-24-hour request time-series (for a sparkline)
 *   summary      — org-level totals (last24h, last7d, last30d)
 *
 * All numbers are request counts sourced from api_key_usage.
 * This endpoint is internal (admin panel) — no API key auth, relies on the
 * same session auth used by the rest of the platform.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { pool } from "@/lib/db";
import {
  getOrgDailyUsage,
} from "@/modules/embed/core/api-keys-db";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";

type Props = { params: Promise<{ kbId: string }> };

// ── Per-key extended stats ─────────────────────────────────────────────────────

type KeyUsageDetail = {
  keyId:       string;
  keyName:     string;
  keyPrefix:   string;
  isActive:    boolean;
  thisHour:    number;
  last24h:     number;
  last7d:      number;
  last30d:     number;
  lastUsedAt:  string | null;
};

async function getKeysUsageDetail(kbId: string): Promise<KeyUsageDetail[]> {
  const result = await pool.query<{
    id:           string;
    name:         string;
    key_prefix:   string;
    is_active:    boolean;
    last_used_at: string | null;
    this_hour:    string;
    last_24h:     string;
    last_7d:      string;
    last_30d:     string;
  }>(
    `SELECT
       ak.id,
       ak.name,
       ak.key_prefix,
       ak.is_active,
       ak.last_used_at,
       COALESCE(SUM(CASE WHEN aku.hour >= date_trunc('hour', now())       THEN aku.count ELSE 0 END), 0) AS this_hour,
       COALESCE(SUM(CASE WHEN aku.hour >= now() - INTERVAL '24 hours'     THEN aku.count ELSE 0 END), 0) AS last_24h,
       COALESCE(SUM(CASE WHEN aku.hour >= now() - INTERVAL '7 days'       THEN aku.count ELSE 0 END), 0) AS last_7d,
       COALESCE(SUM(CASE WHEN aku.hour >= now() - INTERVAL '30 days'      THEN aku.count ELSE 0 END), 0) AS last_30d
     FROM api_keys ak
     LEFT JOIN api_key_usage aku ON aku.key_id = ak.id
     WHERE ak.kb_id = $1
     GROUP BY ak.id
     ORDER BY ak.created_at ASC`,
    [kbId]
  );

  return result.rows.map(r => ({
    keyId:      r.id,
    keyName:    r.name,
    keyPrefix:  r.key_prefix,
    isActive:   r.is_active,
    thisHour:   parseInt(r.this_hour, 10),
    last24h:    parseInt(r.last_24h,  10),
    last7d:     parseInt(r.last_7d,   10),
    last30d:    parseInt(r.last_30d,  10),
    lastUsedAt: r.last_used_at ?? null,
  }));
}

// ── Hourly time-series (last 24 h) ────────────────────────────────────────────

type HourlyPoint = { hour: string; count: number };

async function getHourlySeries(orgId: string): Promise<HourlyPoint[]> {
  // Generate a complete 24-slot series (with 0s for empty hours)
  const result = await pool.query<{ hour: string; count: string }>(
    `SELECT
       to_char(date_trunc('hour', aku.hour), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS hour,
       SUM(aku.count) AS count
     FROM api_key_usage aku
     JOIN api_keys ak ON ak.id = aku.key_id
     WHERE ak.org_id = $1
       AND aku.hour  >= now() - INTERVAL '24 hours'
     GROUP BY date_trunc('hour', aku.hour)
     ORDER BY 1 ASC`,
    [orgId]
  );

  return result.rows.map(r => ({
    hour:  r.hour,
    count: parseInt(r.count, 10),
  }));
}

// ── Plan / quota lookup ───────────────────────────────────────────────────────

type PlanQuota = {
  planId:       string;
  planName:     string;
  maxReqDay:    number;
  voiceEnabled: boolean;
  orgDailyUsage: number;
  percentUsed:  number | null; // null when unlimited
};

async function getOrgPlanQuota(orgId: string): Promise<PlanQuota | null> {
  const result = await pool.query<{
    plan_id:       string;
    plan_name:     string;
    max_req_day:   number;
    voice_enabled: boolean;
  }>(
    `SELECT
       sp.id           AS plan_id,
       sp.name         AS plan_name,
       COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
       COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled
     FROM org_subscriptions os
     JOIN subscription_plans sp ON sp.id = os.plan_id
     LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
     WHERE os.org_id = $1
       AND os.status IN ('active', 'trialing')
     LIMIT 1`,
    [orgId]
  );

  if (!result.rows[0]) return null;
  const row = result.rows[0];

  const dailyUsage   = await getOrgDailyUsage(orgId);
  const unlimited    = row.max_req_day === -1;
  const percentUsed  = unlimited || row.max_req_day === 0
    ? null
    : Math.min(100, Math.round((dailyUsage / row.max_req_day) * 100));

  return {
    planId:        row.plan_id,
    planName:      row.plan_name,
    maxReqDay:     row.max_req_day,
    voiceEnabled:  row.voice_enabled,
    orgDailyUsage: dailyUsage,
    percentUsed,
  };
}

// ── Summary totals ────────────────────────────────────────────────────────────

type UsageSummary = { last24h: number; last7d: number; last30d: number };

async function getOrgUsageSummary(orgId: string): Promise<UsageSummary> {
  const result = await pool.query<{ last_24h: string; last_7d: string; last_30d: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN aku.hour >= now() - INTERVAL '24 hours' THEN aku.count ELSE 0 END), 0) AS last_24h,
       COALESCE(SUM(CASE WHEN aku.hour >= now() - INTERVAL '7 days'   THEN aku.count ELSE 0 END), 0) AS last_7d,
       COALESCE(SUM(CASE WHEN aku.hour >= now() - INTERVAL '30 days'  THEN aku.count ELSE 0 END), 0) AS last_30d
     FROM api_key_usage aku
     JOIN api_keys ak ON ak.id = aku.key_id
     WHERE ak.org_id = $1`,
    [orgId]
  );

  const row = result.rows[0];
  return {
    last24h: parseInt(row?.last_24h ?? "0", 10),
    last7d:  parseInt(row?.last_7d  ?? "0", 10),
    last30d: parseInt(row?.last_30d ?? "0", 10),
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Props): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId } = await params;

    // Usage reports contain API-key identifiers and organization-wide
    // subscription analytics. A KB id alone does not authorize disclosure.
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "kb:read");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "KB not found" }, { status: 404 });

    // Resolve orgId for this KB
    const orgResult = await pool.query<{ org_id: string }>(
      `SELECT p.org_id
       FROM knowledge_bases kb
       JOIN agents p ON p.id = kb.agent_id
       WHERE kb.id = $1`,
      [kbId]
    );
    const orgId = orgResult.rows[0]?.org_id;
    if (!orgId) return NextResponse.json({ error: "Organisation not found for KB" }, { status: 404 });

    // Fetch everything in parallel
    const [keys, quota, hourly, summary] = await Promise.all([
      getKeysUsageDetail(kbId),
      getOrgPlanQuota(orgId),
      getHourlySeries(orgId),
      getOrgUsageSummary(orgId),
    ]);

    return NextResponse.json({
      quota,    // plan caps + today's usage + % used
      keys,     // per-key breakdown (thisHour / last24h / last7d / last30d)
      hourly,   // [{hour, count}] for the last 24 h — use for a sparkline chart
      summary,  // org-wide totals
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[api-keys/usage] GET:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
