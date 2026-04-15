/**
 * GET /api/phone/log
 * Returns call logs for a KB — metadata only, no AI logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const kbId = req.nextUrl.searchParams.get("kbId");
    if (!kbId) return NextResponse.json({ error: "kbId required" }, { status: 400 });

    const rows = await query(
      `SELECT id, call_sid, provider, status, from_number, to_number,
              answered_at, ended_at, duration_sec, turn_count, transcript, created_at
       FROM phone_call_logs
       WHERE kb_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [kbId],
    );
    return NextResponse.json({ logs: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
