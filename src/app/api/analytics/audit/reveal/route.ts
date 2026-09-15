/**
 * POST /api/analytics/audit/reveal
 * ─────────────────────────────────────────────────────────────────────────────
 * WS-1.4: justified reveal of redacted PII in a single audit row.
 *
 * The Q&A audit trail masks emails / phones / payment identifiers at write
 * time. Platform admins can reveal the original ONLY by recording a
 * justification; the reveal itself is written to audit_logs, so every access
 * to raw PII is itself audited.
 *
 * Body: { eventId: string, justification: string (>= 10 chars) }
 *
 * Auth: super-admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { writeAuditLog } from "@/modules/auth/core/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = (await req.json().catch(() => ({}))) as {
      eventId?: string;
      justification?: string;
    };

    const eventId = (body.eventId ?? "").trim();
    const justification = (body.justification ?? "").trim();

    if (!UUID_RE.test(eventId)) {
      return NextResponse.json({ error: "A valid eventId is required." }, { status: 400 });
    }
    if (justification.length < 10) {
      return NextResponse.json(
        { error: "A justification of at least 10 characters is required to reveal redacted content." },
        { status: 400 },
      );
    }

    const rows = await query<{
      id: string; org_id: string | null; query_text: string; query_raw: string | null;
      answer_text: string | null; answer_raw: string | null; redactions: string;
    }>(
      `SELECT id, org_id::text AS org_id, query_text, query_raw,
              answer_text, answer_raw, redactions::text AS redactions
         FROM query_events WHERE id = $1`,
      [eventId],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Audit row not found." }, { status: 404 });
    }
    if (row.query_raw == null && row.answer_raw == null) {
      return NextResponse.json(
        { error: "This row contains no redacted content — nothing to reveal." },
        { status: 409 },
      );
    }

    // The reveal is itself audited, with the justification on record.
    await writeAuditLog({
      userId: auth.user.id,
      orgId: row.org_id ?? undefined,
      action: "audit.reveal",
      resourceType: "query_event",
      resourceId: row.id,
      newData: {
        justification,
        revealed: [
          row.query_raw != null ? "query_raw" : null,
          row.answer_raw != null ? "answer_raw" : null,
        ].filter(Boolean),
        at: new Date().toISOString(),
      },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    return NextResponse.json({
      eventId: row.id,
      redactions: JSON.parse(row.redactions || "[]"),
      queryText: row.query_raw ?? row.query_text,
      answerText: row.answer_raw ?? row.answer_text,
      revealedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/analytics/audit/reveal]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
