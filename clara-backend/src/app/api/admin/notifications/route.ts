/**
 * GET  /api/admin/notifications?limit=50  — list recent queued notifications
 * POST /api/admin/notifications/retry      — retry failed notifications
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";

export async function GET(req: NextRequest) {
  const limit  = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") ?? "50") || 50);
  const status = req.nextUrl.searchParams.get("status"); // optional filter

  try {
    await ensureMigrated();

    const statusFilter = status ? `AND status = '${status.replace(/'/g,"''")}' ` : "";

    const rows = await query(`
      SELECT sn.id, sn.org_id, o.name AS org_name,
             sn.recipient_email, sn.notification_type,
             sn.subject, sn.status, sn.attempts,
             sn.sent_at, sn.error_message, sn.created_at
      FROM subscription_notifications sn
      JOIN organisations o ON o.id = sn.org_id
      WHERE TRUE ${statusFilter}
      ORDER BY sn.created_at DESC
      LIMIT $1
    `, [limit]);

    const summary = await query(`
      SELECT status, COUNT(*)::int AS count
      FROM subscription_notifications
      GROUP BY status
    `);

    return NextResponse.json({ notifications: rows, summary });
  } catch (err) {
    console.error("[GET /api/admin/notifications]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
