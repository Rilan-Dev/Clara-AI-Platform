/**
 * POST /api/admin/notifications/retry
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-attempts delivery of failed subscription notifications.
 *
 * Body (all optional):
 *   { id?: string }            — retry one specific notification
 *   { all?: boolean }          — retry every failed notification (cap: 50/run)
 *   Default (no body fields):  — retry the 25 oldest failed notifications.
 *
 * The stored subject/body_html are re-sent through the CURRENT active email
 * provider, so fixing SMTP/Resend credentials and hitting retry is enough to
 * drain a failed backlog.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { sendPlatformEmail } from "@/lib/email";

const MAX_BATCH = 50;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = await req.json().catch(() => ({}) as { id?: string; all?: boolean });

    let rows: Array<{
      id: string; recipient_email: string; subject: string;
      body_html: string; body_text: string | null; attempts: number;
    }>;

    if (body.id) {
      rows = await query(
        `SELECT id, recipient_email, subject, body_html, body_text, attempts
           FROM subscription_notifications
          WHERE id = $1 AND status = 'failed'`,
        [body.id],
      );
    } else {
      rows = await query(
        `SELECT id, recipient_email, subject, body_html, body_text, attempts
           FROM subscription_notifications
          WHERE status = 'failed'
          ORDER BY created_at ASC
          LIMIT $1`,
        [body.all ? MAX_BATCH : 25],
      );
    }

    let retried = 0;
    let succeeded = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const row of rows) {
      retried++;
      const result = await sendPlatformEmail({
        to: row.recipient_email,
        subject: row.subject,
        html: row.body_html,
        text: row.body_text ?? undefined,
      });

      if (result.sent) {
        succeeded++;
        await query(
          `UPDATE subscription_notifications
              SET status = 'sent', sent_at = now(), attempts = attempts + 1, error_message = NULL
            WHERE id = $1`,
          [row.id],
        );
      } else if (result.provider === "console") {
        // No provider configured — reset to pending so it retries once a
        // provider is set, instead of silently marking it sent.
        await query(
          `UPDATE subscription_notifications SET status = 'pending' WHERE id = $1`,
          [row.id],
        );
        failures.push({ id: row.id, error: "No email provider configured (dev mode)." });
      } else {
        await query(
          `UPDATE subscription_notifications
              SET status = 'failed', attempts = attempts + 1, error_message = $2
            WHERE id = $1`,
          [row.id, result.error ?? "unknown error"],
        );
        failures.push({ id: row.id, error: result.error ?? "unknown error" });
      }
    }

    return NextResponse.json({
      ok: true,
      retried,
      succeeded,
      failed: failures.length,
      failures: failures.slice(0, 10),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/admin/notifications/retry]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
