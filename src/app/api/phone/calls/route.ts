/**
 * GET /api/phone/calls?kbId=xxx — phone call logs for a KB
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getCallLogs }    from "@/modules/phone/core/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { searchParams } = new URL(req.url);
    const kbId  = searchParams.get("kbId") ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
    if (!kbId) return NextResponse.json({ error: "kbId required" }, { status: 400 });
    const logs = await getCallLogs(kbId, limit);
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
