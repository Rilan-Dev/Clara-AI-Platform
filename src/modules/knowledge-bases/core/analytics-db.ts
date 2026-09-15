/**
 * src/modules/knowledge-bases/core/analytics-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Write + read from query_events table for per-KB usage analytics.
 *
 * The table doubles as the platform's query audit trail: every user prompt is
 * inserted at request time (status='pending' — counts toward daily quotas
 * immediately, so limits cannot be bypassed by aborting streams) and then
 * finalised with the AI-generated answer once the stream completes.
 *
 * WS-1.1 (usage-event spine): finalisation also persists the metering facts —
 * model, provider, prompt/completion token counts and estimated cost in
 * micro-dollars — taken from the provider's own usage report, never guessed.
 * Non-chat billable invocations (embedding batches during ingestion) append to
 * the separate usage_events table via logUsageEvent().
 */

import { query, execute } from "@/lib/db";
import {
  estimateChatCostUsdMicros,
  estimateEmbeddingCostUsdMicros,
} from "@/modules/ai-core/model-catalog";

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

/** Metering facts captured from the provider's usage report (WS-1.1). */
export type UsageMetering = {
  model:             string;
  provider:         string;
  promptTokens:     number;
  completionTokens: number;
  /** Estimated cost in micro-dollars; computed from the catalogue when absent. */
  costUsdMicros?:   number;
};

/**
 * Finalise a query event after the AI stream completes — persists the
 * generated answer so platform admins can audit prompts AND responses,
 * plus the token/cost metering for the usage spine.
 */
export async function finalizeQueryEvent(
  eventId: string | null,
  opts: {
    answerText: string;
    status?:    QueryStatus;
    latencyMs?: number;
    sourceCount?: number;  // patched when retrieval completed after insert
    /** WS-1.1 metering (model, tokens, cost) from the provider usage report. */
    metering?:  UsageMetering | null;
    /** True when the user cancelled the stream; partial answer is kept. */
    cancelled?: boolean;
  }
): Promise<void> {
  if (!eventId) return;
  try {
    // An empty answer stays NULL — "no answer captured" is distinct from "".
    const answer = opts.answerText && opts.answerText.length > 0
      ? truncate(opts.answerText, 8000)
      : null;

    const metering = opts.metering ?? null;
    const costUsdMicros = metering
      ? metering.costUsdMicros ??
        estimateChatCostUsdMicros(metering.model, metering.promptTokens, metering.completionTokens)
      : 0;

    await execute(
      `UPDATE query_events
          SET answer_text       = $2,
              status            = $3,
              latency_ms        = COALESCE($4, latency_ms),
              source_count      = COALESCE($5, source_count),
              model             = COALESCE($6, model),
              provider          = COALESCE($7, provider),
              prompt_tokens     = COALESCE($8, prompt_tokens),
              completion_tokens = COALESCE($9, completion_tokens),
              cost_usd_micros   = $10,
              cancelled         = $11
        WHERE id = $1`,
      [
        eventId,
        answer,
        opts.status ?? "ok",
        opts.latencyMs ?? null,
        opts.sourceCount ?? null,
        metering?.model ?? null,
        metering?.provider ?? null,
        metering?.promptTokens ?? null,
        metering?.completionTokens ?? null,
        costUsdMicros,
        opts.cancelled ?? false,
      ]
    );
  } catch (err) {
    console.warn("[analytics] failed to finalise query event:", (err as Error).message);
  }
}

/**
 * WS-1.1: append one usage event for a NON-chat billable invocation
 * (an embedding batch during ingestion; TTS/OCR later). Append-only —
 * corrections are compensating rows, never updates.
 */
export async function logUsageEvent(opts: {
  kind:            "EMBEDDING" | "TTS" | "OCR" | "TRANSCRIPTION";
  model:           string;
  provider?:       string;
  orgId?:          string | null;
  kbId?:           string | null;
  agentId?:        string | null;
  documentId?:     string | null;
  promptTokens:    number;
  completionTokens?: number;
  latencyMs?:      number;
  metadata?:       Record<string, unknown>;
}): Promise<void> {
  if (opts.promptTokens <= 0) return;   // nothing billable to record
  try {
    const cost =
      opts.kind === "EMBEDDING"
        ? estimateEmbeddingCostUsdMicros(opts.model, opts.promptTokens)
        : 0;
    await execute(
      `INSERT INTO usage_events
         (org_id, kind, agent_id, kb_id, document_id, model, provider,
          prompt_tokens, completion_tokens, cost_usd_micros, latency_ms, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        opts.orgId ?? null,
        opts.kind,
        opts.agentId ?? null,
        opts.kbId ?? null,
        opts.documentId ?? null,
        opts.model,
        opts.provider ?? null,
        opts.promptTokens,
        opts.completionTokens ?? 0,
        cost,
        opts.latencyMs ?? null,
        JSON.stringify(opts.metadata ?? {}),
      ]
    );
  } catch (err) {
    // metering must never break the pipeline that is being metered
    console.warn("[analytics] failed to log usage event:", (err as Error).message);
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

// ── Read: org-level metering aggregation (WS-1.1 dashboards) ─────────────────

export type OrgUsageMetering = {
  chat: {
    promptTokens:     number;
    completionTokens: number;
    costUsdMicros:    number;
    requests:         number;
  };
  embedding: {
    promptTokens:     number;
    costUsdMicros:    number;
    batches:          number;
  };
  byModel: Array<{
    model:            string;
    requests:         number;
    promptTokens:     number;
    completionTokens: number;
    costUsdMicros:    number;
  }>;
};

/**
 * Aggregated token + cost metering for an organisation (last N days),
 * combining chat (query_events) and embedding (usage_events) usage.
 */
export async function getOrgUsageMetering(
  orgId: string,
  days = 30,
): Promise<OrgUsageMetering> {
  const window = `created_at >= now() - ($2 || ' days')::interval`;

  const [chatRow] = await query<{
    prompt_tokens: string; completion_tokens: string; cost_usd_micros: string; requests: string;
  }>(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(cost_usd_micros), 0)   AS cost_usd_micros,
       COUNT(*)                            AS requests
     FROM query_events
     WHERE org_id = $1 AND ${window}`,
    [orgId, String(days)]
  );

  const [embedRow] = await query<{
    prompt_tokens: string; cost_usd_micros: string; batches: string;
  }>(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0)   AS prompt_tokens,
       COALESCE(SUM(cost_usd_micros), 0) AS cost_usd_micros,
       COUNT(*)                          AS batches
     FROM usage_events
     WHERE org_id = $1 AND kind = 'EMBEDDING' AND ${window}`,
    [orgId, String(days)]
  );

  const byModel = await query<{
    model: string; requests: string; prompt_tokens: string; completion_tokens: string; cost_usd_micros: string;
  }>(
    `SELECT
       model,
       COUNT(*)                            AS requests,
       COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(cost_usd_micros), 0)   AS cost_usd_micros
     FROM query_events
     WHERE org_id = $1 AND model IS NOT NULL AND ${window}
     GROUP BY model
     ORDER BY cost_usd_micros DESC
     LIMIT 20`,
    [orgId, String(days)]
  );

  return {
    chat: {
      promptTokens:     Number(chatRow?.prompt_tokens ?? 0),
      completionTokens: Number(chatRow?.completion_tokens ?? 0),
      costUsdMicros:    Number(chatRow?.cost_usd_micros ?? 0),
      requests:         Number(chatRow?.requests ?? 0),
    },
    embedding: {
      promptTokens:     Number(embedRow?.prompt_tokens ?? 0),
      costUsdMicros:    Number(embedRow?.cost_usd_micros ?? 0),
      batches:          Number(embedRow?.batches ?? 0),
    },
    byModel: byModel.map((r) => ({
      model:            r.model,
      requests:         Number(r.requests),
      promptTokens:     Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      costUsdMicros:    Number(r.cost_usd_micros),
    })),
  };
}
