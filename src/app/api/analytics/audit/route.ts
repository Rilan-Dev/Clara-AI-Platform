/**
 * GET /api/analytics/audit
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-wide query audit — every user prompt WITH the AI-generated answer.
 *
 * This is the platform admin's compliance view: what users asked, what the
 * assistant answered, on which surface (workspace / widget / voice), when,
 * and how long it took.
 *
 * Query params:
 *   from    ISO date string (default: 7 days ago)
 *   to      ISO date string (default: now)
 *   orgId   filter to a single organisation (optional)
 *   q       substring search across question / answer / KB name (optional)
 *   limit   page size (default: 50, max: 100)
 *   offset  pagination offset (default: 0)
 *
 * Auth: super-admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { AuditFilterError, parseAuditFilters } from "./filters";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // Cross-tenant audit — super admin only.
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { fromDate, toDate, orgId, search, limit, offset } = parseAuditFilters(
      req.nextUrl.searchParams,
      new Date(),
      { defaultLimit: 50, maxLimit: 100, withOffset: true },
    );

    const where: string[] = ["qe.created_at BETWEEN $1 AND $2"];
    const params: unknown[] = [fromDate.toISOString(), toDate.toISOString()];
    if (orgId) {
      params.push(orgId);
      where.push(`qe.org_id = $${params.length}::uuid`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(qe.query_text ILIKE $${idx} OR COALESCE(qe.answer_text, '') ILIKE $${idx} OR COALESCE(kb.name, '') ILIKE $${idx})`);
    }
    const whereSql = where.join(" AND ");

    // ── Audit rows (joined for display) ─────────────────────────────────────
    const rows = await query<{
      id: string; org_id: string | null; org_name: string | null;
      kb_id: string; kb_name: string | null; user_email: string | null;
      question: string; answer: string | null; surface: string; status: string;
      latency_ms: number | null; created_at: string; redacted: boolean;
    }>(`
      SELECT qe.id,
             qe.org_id,
             o.name  AS org_name,
             qe.kb_id,
             kb.name AS kb_name,
             (SELECT u.email FROM users u WHERE u.id = qe.user_id) AS user_email,
             qe.query_text  AS question,
             qe.answer_text AS answer,
             qe.surface,
             qe.status,
             qe.latency_ms,
             qe.created_at::text AS created_at,
             -- Only whether PII was redacted — the raw values stay behind the
             -- audited, justified POST /api/analytics/audit/reveal.
             (qe.query_raw IS NOT NULL OR qe.answer_raw IS NOT NULL) AS redacted
        FROM query_events qe
        LEFT JOIN organisations o  ON o.id  = qe.org_id
        LEFT JOIN knowledge_bases kb ON kb.id = qe.kb_id
       WHERE ${whereSql}
       ORDER BY qe.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `, params);

    // ── Total count for pagination ──────────────────────────────────────────
    const totalR = await query<{ total: number }>(`
      SELECT COUNT(*)::int AS total
        FROM query_events qe
        LEFT JOIN knowledge_bases kb ON kb.id = qe.kb_id
       WHERE ${whereSql}
    `, params);

    // ── Org filter options (for the dropdown) ───────────────────────────────
    const orgs = await query<{ id: string; name: string }>(`
      SELECT DISTINCT o.id, o.name
        FROM query_events qe
        JOIN organisations o ON o.id = qe.org_id
       WHERE qe.created_at >= now() - INTERVAL '30 days'
       ORDER BY o.name ASC
    `);

    return NextResponse.json({
      rows,
      total: totalR[0]?.total ?? 0,
      hasMore: (totalR[0]?.total ?? 0) > offset + rows.length,
      orgs,
      meta: { from: fromDate.toISOString(), to: toDate.toISOString(), orgId, q: search || null, limit, offset },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AuditFilterError) {
      return NextResponse.json(
        { error: err.message, code: "INVALID_AUDIT_FILTER" },
        { status: 400 },
      );
    }
    console.error("[GET /api/analytics/audit]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
