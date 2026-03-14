/**
 * GET /api/kbs/[kbId]/scrape/sessions/[sessionId]/failures
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns detailed failure information for a scrape session.
 */

import { NextResponse } from "next/server";
import { listFailedUrlsForSession, getSessionById } from "@/modules/knowledge-bases/core/scrape-sessions-db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const failures = await listFailedUrlsForSession(sessionId);
    
    return NextResponse.json({ failures });
  } catch (error) {
    console.error("[failures-api] Error fetching failure logs:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
