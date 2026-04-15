/**
 * GET  /api/phone/calls
 * POST /api/phone/calls
 *
 * Call log CRUD — metadata only, stays in clara-backend (hits the DB directly).
 * No AI logic here. Just re-exports from the phone API module if it exists,
 * otherwise returns a stub.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const kbId = req.nextUrl.searchParams.get("kbId");
    if (!kbId) return NextResponse.json({ error: "kbId required" }, { status: 400 });

    const rows = await query(
      `SELECT * FROM phone_call_logs WHERE kb_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [kbId],
    );
    return NextResponse.json({ calls: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
