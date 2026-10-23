/**
 * GET /api/analytics/audit/export
 * ─────────────────────────────────────────────────────────────────────────────
 * WS-1.4: CSV export of the Q&A audit trail for investigations — the same
 * filters as the audit viewer (from / to / orgId / q), redacted columns only
 * (raw originals never leave through this endpoint).
 *
 * Auth: super-admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { AuditFilterError, parseAuditFilters } from "../filters";

/** RFC 4180 CSV field escaping. */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    // Keep export filters identical to the audit viewer, except for its
    // intentional larger (but capped) CSV page size.
    const { fromDate, toDate, orgId, search, limit } = parseAuditFilters(
      req.nextUrl.searchParams,
      new Date(),
      { defaultLimit: 5000, maxLimit: 10_000, withOffset: false },
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

    const rows = await query<{
      id: string; created_at: string; org_name: string | null; kb_name: string | null;
      user_email: string | null; surface: string; status: string; question: string;
      answer: string | null; model: string | null; prompt_tokens: number;
      completion_tokens: number; cost_usd_micros: number; latency_ms: number | null;
      redactions: string; cancelled: boolean;
    }>(
      `SELECT qe.id,
              qe.created_at::text AS created_at,
              o.name  AS org_name,
              kb.name AS kb_name,
              (SELECT u.email FROM users u WHERE u.id = qe.user_id) AS user_email,
              qe.surface, qe.status,
              qe.query_text  AS question,
              qe.answer_text AS answer,
              qe.model, qe.prompt_tokens, qe.completion_tokens,
              qe.cost_usd_micros, qe.latency_ms,
              qe.redactions::text AS redactions,
              qe.cancelled
         FROM query_events qe
         LEFT JOIN organisations o  ON o.id  = qe.org_id
         LEFT JOIN knowledge_bases kb ON kb.id = qe.kb_id
        WHERE ${whereSql}
        ORDER BY qe.created_at DESC
        LIMIT ${limit}`,
      params,
    );

    const header = [
      "id", "created_at", "organisation", "knowledge_base", "user_email",
      "surface", "status", "question", "answer", "model",
      "prompt_tokens", "completion_tokens", "cost_usd_micros", "latency_ms",
      "redactions", "cancelled",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        csvField(r.id),
        csvField(r.created_at),
        csvField(r.org_name),
        csvField(r.kb_name),
        csvField(r.user_email),
        csvField(r.surface),
        csvField(r.status),
        csvField(r.question),
        csvField(r.answer),
        csvField(r.model),
        csvField(r.prompt_tokens),
        csvField(r.completion_tokens),
        csvField(r.cost_usd_micros),
        csvField(r.latency_ms),
        csvField(r.redactions),
        csvField(r.cancelled ? "true" : "false"),
      ].join(","));
    }

    const filename = `clara-qa-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(lines.join("\r\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AuditFilterError) {
      return NextResponse.json(
        { error: err.message, code: "INVALID_AUDIT_FILTER" },
        { status: 400 },
      );
    }
    console.error("[GET /api/analytics/audit/export]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
