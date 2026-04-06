/**
 * src/modules/knowledge-bases/core/analytics-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Write + read from query_events table for per-KB usage analytics.
 */

import { query, execute } from "@/lib/db";

// ── Write ─────────────────────────────────────────────────────────────────────

export async function logQueryEvent(opts: {
  kbId:        string;
  queryText:   string;
  sourceCount: number;
  latencyMs?:  number;
  sessionId?:  string;
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO query_events (kb_id, query_text, source_count, latency_ms, session_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [opts.kbId, opts.queryText, opts.sourceCount, opts.latencyMs ?? null, opts.sessionId ?? null]
    );
  } catch (err) {
    // analytics must never break the request
    console.warn("[analytics] failed to log query event:", (err as Error).message);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export type QueryEventRow = {
  date:        string;   // ISO date (YYYY-MM-DD)
  count:       number;
};

export type TopQuery = {
  queryText:   string;
  count:       number;
};

export type KbAnalytics = {
  totalQueries:    number;
  queriesThisWeek: number;
  queriesPerDay:   QueryEventRow[];   // last 30 days
  topQueries:      TopQuery[];        // top 10 by frequency
  avgLatencyMs:    number | null;
  avgSourceCount:  number | null;
};

export async function getKbAnalytics(kbId: string): Promise<KbAnalytics> {
  // Total & this-week counts
  const [totals] = await query<{ total: string; this_week: string; avg_latency: string | null; avg_sources: string | null }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS this_week,
       AVG(latency_ms)   AS avg_latency,
       AVG(source_count) AS avg_sources
     FROM query_events
     WHERE kb_id = $1`,
    [kbId]
  );

  // Queries per day — last 30 days
  const perDay = await query<{ day: string; cnt: string }>(
    `SELECT
       date_trunc('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
       COUNT(*) AS cnt
     FROM query_events
     WHERE kb_id = $1
       AND created_at >= now() - interval '30 days'
     GROUP BY day
     ORDER BY day ASC`,
    [kbId]
  );

  // Top 10 queries (by exact match, case-insensitive)
  const top = await query<{ query_text: string; cnt: string }>(
    `SELECT
       lower(trim(query_text)) AS query_text,
       COUNT(*) AS cnt
     FROM query_events
     WHERE kb_id = $1
     GROUP BY lower(trim(query_text))
     ORDER BY cnt DESC
     LIMIT 10`,
    [kbId]
  );

  return {
    totalQueries:    Number(totals?.total ?? 0),
    queriesThisWeek: Number(totals?.this_week ?? 0),
    queriesPerDay:   perDay.map((r) => ({ date: r.day, count: Number(r.cnt) })),
    topQueries:      top.map((r) => ({ queryText: r.query_text, count: Number(r.cnt) })),
    avgLatencyMs:    totals?.avg_latency != null ? Math.round(Number(totals.avg_latency)) : null,
    avgSourceCount:  totals?.avg_sources != null ? Math.round(Number(totals.avg_sources) * 10) / 10 : null,
  };
}
