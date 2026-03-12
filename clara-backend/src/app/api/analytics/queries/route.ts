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

function safeDateParam(val: string | null, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

type TruncUnit = "day" | "week" | "month";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const sp          = req.nextUrl.searchParams;
    const toDate      = safeDateParam(sp.get("to"),   new Date());
    const fromDate    = safeDateParam(sp.get("from"),  new Date(Date.now() - 30 * 86400 * 1000));
    const granularity = (["day","week","month"].includes(sp.get("granularity") ?? ""))
      ? (sp.get("granularity") as TruncUnit) : "day";
    const orgId       = sp.get("orgId") ?? null;
    const limit       = Math.min(50, parseInt(sp.get("limit") ?? "10") || 10);

    const orgFilter   = orgId
      ? `AND p.org_id = '${orgId.replace(/'/g, "''")}'`
      : "";

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
      JOIN projects p         ON p.id  = kb.project_id
      WHERE qe.created_at BETWEEN $2 AND $3
        ${orgFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `, [granularity, fromDate.toISOString(), toDate.toISOString()]);

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
      JOIN projects p         ON p.id  = kb.project_id
      WHERE qe.created_at BETWEEN $1 AND $2
        AND length(qe.query_text) > 3
        ${orgFilter}
      GROUP BY qe.query_text
      ORDER BY count DESC
      LIMIT $3
    `, [fromDate.toISOString(), toDate.toISOString(), limit]);

    // ── Summary totals ────────────────────────────────────────────────────
    const totals = await query<{
      total_queries:  number;
      unique_queries: number;
      avg_latency:    number | null;
      active_kbs:     number;
    }>(`
      SELECT
        COUNT(*)::int                    AS total_queries,
        COUNT(DISTINCT qe.query_text)::int AS unique_queries,
        ROUND(AVG(qe.latency_ms))::int   AS avg_latency,
        COUNT(DISTINCT qe.kb_id)::int    AS active_kbs
      FROM query_events qe
      JOIN knowledge_bases kb ON kb.id = qe.kb_id
      JOIN projects p         ON p.id  = kb.project_id
      WHERE qe.created_at BETWEEN $1 AND $2
        ${orgFilter}
    `, [fromDate.toISOString(), toDate.toISOString()]);

    // ── Hourly distribution (what hour of day is busiest) ─────────────────
    const hourlyDist = await query<{ hour: number; count: number }>(`
      SELECT
        EXTRACT(HOUR FROM qe.created_at)::int AS hour,
        COUNT(*)::int                          AS count
      FROM query_events qe
      JOIN knowledge_bases kb ON kb.id = qe.kb_id
      JOIN projects p         ON p.id  = kb.project_id
      WHERE qe.created_at BETWEEN $1 AND $2
        ${orgFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `, [fromDate.toISOString(), toDate.toISOString()]);

    return NextResponse.json({
      timeSeries,
      topQueries,
      hourlyDist,
      totals: totals[0] ?? { total_queries: 0, unique_queries: 0, avg_latency: null, active_kbs: 0 },
      meta: { from: fromDate.toISOString(), to: toDate.toISOString(), granularity, orgId },
    });
  } catch (err) {
    console.error("[GET /api/analytics/queries]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
