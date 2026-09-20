/**
 * GET /api/analytics/usage
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-org usage breakdown — queries, KBs, docs, storage, plan.
 *
 * Query params:
 *   from   ISO date string (default: 30 days ago)
 *   to     ISO date string (default: today)
 *   limit  max orgs to return (default: 20, max: 100)
 *   sort   queries | docs | storage  (default: queries)
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // Platform-wide cross-tenant analytics — super admin only.
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const sp       = req.nextUrl.searchParams;
    const toDate   = safeDateParam(sp.get("to"),   new Date());
    const fromDate = safeDateParam(sp.get("from"),  new Date(Date.now() - 30 * 86400 * 1000));
    const limit    = Math.min(100, parseInt(sp.get("limit") ?? "20") || 20);
    const sortBy   = ["queries","docs","storage"].includes(sp.get("sort") ?? "")
      ? sp.get("sort") as string : "queries";

    const orderCol = sortBy === "docs"    ? "doc_count"
                   : sortBy === "storage" ? "storage_bytes"
                   : "query_count";

    // ── Per-org usage breakdown ───────────────────────────────────────────
    const orgUsage = await query<{
      org_id:        string;
      org_name:      string;
      org_slug:      string;
      plan_id:       string;
      plan_name:     string;
      kb_count:      number;
      doc_count:     number;
      storage_bytes: number;
      query_count:   number;
      avg_latency:   number | null;
      user_count:    number;
    }>(`
      SELECT
        o.id                                         AS org_id,
        o.name                                       AS org_name,
        o.slug                                       AS org_slug,
        COALESCE(os.plan_id, 'free')                 AS plan_id,
        COALESCE(sp.name, 'Free')                    AS plan_name,
        COUNT(DISTINCT kb.id)::int                   AS kb_count,
        COUNT(DISTINCT d.id)::int                    AS doc_count,
        COALESCE(SUM(d.file_size), 0)::bigint        AS storage_bytes,
        COUNT(DISTINCT qe.id)::int                   AS query_count,
        ROUND(AVG(qe.latency_ms))::int               AS avg_latency,
        COUNT(DISTINCT om.user_id)::int              AS user_count
      FROM organisations o
      LEFT JOIN org_subscriptions os  ON os.org_id = o.id
      LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
      LEFT JOIN agents p             ON p.org_id = o.id
      LEFT JOIN knowledge_bases kb   ON kb.agent_id = p.id AND kb.status = 'active'
      LEFT JOIN documents d           ON d.kb_id = kb.id AND d.status = 'ready'
      LEFT JOIN query_events qe       ON qe.kb_id = kb.id
                                      AND qe.created_at BETWEEN $1 AND $2
      LEFT JOIN org_members om        ON om.org_id = o.id
      GROUP BY o.id, o.name, o.slug, COALESCE(os.plan_id,'free'), COALESCE(sp.name,'Free')
      ORDER BY ${orderCol} DESC
      LIMIT $3
    `, [fromDate.toISOString(), toDate.toISOString(), limit]);

    // ── Top KBs by query volume ───────────────────────────────────────────
    const topKbs = await query<{
      kb_id:       string;
      kb_name:     string;
      org_name:    string;
      query_count: number;
      avg_latency: number | null;
      doc_count:   number;
    }>(`
      SELECT
        kb.id                                       AS kb_id,
        kb.name                                     AS kb_name,
        o.name                                      AS org_name,
        COUNT(qe.id)::int                           AS query_count,
        ROUND(AVG(qe.latency_ms))::int              AS avg_latency,
        COUNT(DISTINCT d.id)::int                   AS doc_count
      FROM knowledge_bases kb
      JOIN agents p       ON p.id = kb.agent_id
      JOIN organisations o ON o.id = p.org_id
      LEFT JOIN query_events qe ON qe.kb_id = kb.id
                                AND qe.created_at BETWEEN $1 AND $2
      LEFT JOIN documents d     ON d.kb_id = kb.id AND d.status = 'ready'
      WHERE kb.status = 'active'
      GROUP BY kb.id, kb.name, o.name
      ORDER BY query_count DESC
      LIMIT 10
    `, [fromDate.toISOString(), toDate.toISOString()]);

    // ── Platform-level summary ────────────────────────────────────────────
    const summary = await query<{
      total_orgs:    number;
      total_kbs:     number;
      total_docs:    number;
      total_queries: number;
      total_users:   number;
      total_storage: number;
    }>(`
      SELECT
        COUNT(DISTINCT o.id)::int          AS total_orgs,
        COUNT(DISTINCT kb.id)::int         AS total_kbs,
        COUNT(DISTINCT d.id)::int          AS total_docs,
        COUNT(DISTINCT qe.id)::int         AS total_queries,
        COUNT(DISTINCT u.id)::int          AS total_users,
        COALESCE(SUM(d.file_size), 0)::bigint AS total_storage
      FROM organisations o
      LEFT JOIN agents p        ON p.org_id = o.id
      LEFT JOIN knowledge_bases kb ON kb.agent_id = p.id AND kb.status = 'active'
      LEFT JOIN documents d       ON d.kb_id = kb.id AND d.status = 'ready'
      LEFT JOIN query_events qe   ON qe.kb_id = kb.id
                                  AND qe.created_at BETWEEN $1 AND $2
      LEFT JOIN users u           ON TRUE
    `, [fromDate.toISOString(), toDate.toISOString()]);

    return NextResponse.json({
      orgUsage,
      topKbs,
      summary: summary[0] ?? {
        total_orgs: 0, total_kbs: 0, total_docs: 0,
        total_queries: 0, total_users: 0, total_storage: 0,
      },
      meta: { from: fromDate.toISOString(), to: toDate.toISOString(), sortBy, limit },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/analytics/usage]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
