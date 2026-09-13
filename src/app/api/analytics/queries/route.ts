/**
 * GET /api/analytics/queries
 * ─────────────────────────────────────────────────────────────────────────────
 * Time-series query volume + top queries analysis.
 *
 * Query params:
 *   from        ISO date string (default: 30 days ago)
 *   to          ISO date string (default: today)
 *   granularity day | week | month  (default: day)
 *   orgId       filter to single org (optional)
 *   limit       top-queries count  (default: 10)
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

function safeDateParam(val: string | null, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TruncUnit = "day" | "week" | "month";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // Platform-wide cross-tenant analytics — super admin only.
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const sp          = req.nextUrl.searchParams;
    const toDate      = safeDateParam(sp.get("to"),   new Date());
    const fromDate    = safeDateParam(sp.get("from"),  new Date(Date.now() - 30 * 86400 * 1000));
    const granularity = (["day","week","month"].includes(sp.get("granularity") ?? ""))
      ? (sp.get("granularity") as TruncUnit) : "day";
    const orgIdParam  = sp.get("orgId") ?? null;
    // Reject anything that is not a strict UUID — the value is only ever used
    // as a bound parameter, never interpolated into the SQL text.
    const orgId       = orgIdParam && UUID_RE.test(orgIdParam) ? orgIdParam : null;
    const limit       = Math.min(50, parseInt(sp.get("limit") ?? "10") || 10);

    const orgFilter = orgId ? `AND p.org_id = $4::uuid` : "";

    // ── Time-series: query counts per granularity bucket ──────────────────
    const timeSeries = await query<{
      bucket: string;
      count:  number;
      avg_latency: number | null;
    }>(`
      SELECT
        date_trunc($1, qe.created_at)::date::text  AS bucket,
        COUNT(*)::int                               AS count,
        ROUND(AVG(qe.latency_ms))::int             AS avg_latency
      FROM query_events qe
      JOIN knowledge_bases kb ON kb.id = qe.kb_id
      JOIN agents p          ON p.id  = kb.agent_id
      WHERE qe.created_at BETWEEN $2 AND $3
        ${orgFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `, orgId
      ? [granularity, fromDate.toISOString(), toDate.toISOString(), orgId]
      : [granularity, fromDate.toISOString(), toDate.toISOString()]);

    // ── Top queries by frequency ──────────────────────────────────────────
    const topQueries = await query<{
      query_text: string;
      count:      number;
      avg_latency: number | null;
      orgs:       number;
    }>(`
      SELECT
        qe.query_text,
        COUNT(*)::int                   AS count,
        ROUND(AVG(qe.latency_ms))::int  AS avg_latency,
        COUNT(DISTINCT p.org_id)::int   AS orgs
      FROM query_events qe
      JOIN knowledge_bases kb ON kb.id = qe.kb_id
      JOIN agents p          ON p.id  = kb.agent_id
      WHERE qe.created_at BETWEEN $1 AND $2
        AND length(qe.query_text) > 3
        ${orgId ? "AND p.org_id = $4::uuid" : ""}
      GROUP BY qe.query_text
      ORDER BY count DESC
      LIMIT $3
    `, orgId
      ? [fromDate.toISOString(), toDate.toISOString(), limit, orgId]
      : [fromDate.toISOString(), toDate.toISOString(), limit]);

    // ── Summary totals ────────────────────────────────────────────────────
    const totals = await query<{
      total_queries:  number;
      unique_queries: number;
      avg_latency:    number | null;
      active_kbs:     number;
    }>(`
      SELECT
        COUNT(*)::int                      AS total_queries,
        COUNT(DISTINCT qe.query_text)::int AS unique_queries,
        ROUND(AVG(qe.latency_ms))::int     AS avg_latency,
        COUNT(DISTINCT qe.kb_id)::int      AS active_kbs
      FROM query_events qe
      JOIN knowledge_bases kb ON kb.id = qe.kb_id
      JOIN agents p          ON p.id  = kb.agent_id
      WHERE qe.created_at BETWEEN $1 AND $2
        ${orgId ? "AND p.org_id = $3::uuid" : ""}
    `, orgId
      ? [fromDate.toISOString(), toDate.toISOString(), orgId]
      : [fromDate.toISOString(), toDate.toISOString()]);

    // ── Hourly distribution (what hour of day is busiest) ─────────────────
    const hourlyDist = await query<{ hour: number; count: number }>(`
      SELECT
        EXTRACT(HOUR FROM qe.created_at)::int AS hour,
        COUNT(*)::int                          AS count
      FROM query_events qe
      JOIN knowledge_bases kb ON kb.id = qe.kb_id
      JOIN agents p          ON p.id  = kb.agent_id
      WHERE qe.created_at BETWEEN $1 AND $2
        ${orgId ? "AND p.org_id = $3::uuid" : ""}
      GROUP BY 1
      ORDER BY 1 ASC
    `, orgId
      ? [fromDate.toISOString(), toDate.toISOString(), orgId]
      : [fromDate.toISOString(), toDate.toISOString()]);

    return NextResponse.json({
      timeSeries,
      topQueries,
      hourlyDist,
      totals: totals[0] ?? { total_queries: 0, unique_queries: 0, avg_latency: null, active_kbs: 0 },
      meta: { from: fromDate.toISOString(), to: toDate.toISOString(), granularity, orgId },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/analytics/queries]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
