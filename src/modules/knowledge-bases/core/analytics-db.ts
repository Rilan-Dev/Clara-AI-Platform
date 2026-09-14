/**
 * src/modules/knowledge-bases/core/analytics-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Write + read from query_events table for per-KB usage analytics.
 *
 * The table doubles as the platform's query audit trail: every user prompt is
 * inserted at request time (status='pending' — counts toward daily quotas
 * immediately, so limits cannot be bypassed by aborting streams) and then
 * finalised with the AI-generated answer once the stream completes.
 */

import { query, execute } from "@/lib/db";

// ── Write ─────────────────────────────────────────────────────────────────────

export type QuerySurface = "workspace" | "embed" | "voice" | "search";
export type QueryStatus  = "pending" | "ok" | "error";

export async function logQueryEvent(opts: {
  kbId:        string;
  queryText:   string;
  sourceCount?: number;   // known after retrieval; 0 at request time
  latencyMs?:  number;
  sessionId?:  string;
  /** Audit context — org is resolved from the KB when not provided. */
  orgId?:      string | null;
  userId?:     string | null;
  surface?:    QuerySurface;
  /** Set for one-shot flows (search); chat streams finalise later. */
  answerText?: string | null;
  status?:     QueryStatus;
}): Promise<string | null> {
  try {
    // Resolve the owning org from kb → agent unless the caller already
    // knows it (embed context carries it from the validated API key).
    let orgId = opts.orgId ?? null;
    if (!orgId) {
      const orgRows = await query<{ org_id: string }>(
        `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
        [opts.kbId]
      );
      orgId = orgRows[0]?.org_id ?? null;
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO query_events
         (kb_id, query_text, source_count, latency_ms, session_id,
          org_id, user_id, answer_text, surface, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        opts.kbId,
        opts.queryText,
        opts.sourceCount ?? 0,
        opts.latencyMs ?? null,
        opts.sessionId ?? null,
        orgId,
        opts.userId ?? null,
        opts.answerText != null ? truncate(opts.answerText, 8000) : null,
        opts.surface ?? "workspace",
        opts.status ?? (opts.answerText != null ? "ok" : "pending"),
      ]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    // analytics must never break the request
    console.warn("[analytics] failed to log query event:", (err as Error).message);
    return null;
  }
}

/**
 * Finalise a query event after the AI stream completes — persists the
 * generated answer so platform admins can audit prompts AND responses.
 */
export async function finalizeQueryEvent(
  eventId: string | null,
  opts: {
    answerText: string;
    status?:    QueryStatus;
    latencyMs?: number;
    sourceCount?: number;  // patched when retrieval completed after insert
  }
): Promise<void> {
  if (!eventId) return;
  try {
    // An empty answer stays NULL — "no answer captured" is distinct from "".
    const answer = opts.answerText && opts.answerText.length > 0
      ? truncate(opts.answerText, 8000)
      : null;
    await execute(
      `UPDATE query_events
          SET answer_text  = $2,
              status       = $3,
              latency_ms   = COALESCE($4, latency_ms),
              source_count = COALESCE($5, source_count)
        WHERE id = $1`,
      [eventId, answer, opts.status ?? "ok", opts.latencyMs ?? null, opts.sourceCount ?? null]
    );
  } catch (err) {
    console.warn("[analytics] failed to finalise query event:", (err as Error).message);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
