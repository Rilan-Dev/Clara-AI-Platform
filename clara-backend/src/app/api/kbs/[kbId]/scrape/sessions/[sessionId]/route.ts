// GET /api/kbs/[kbId]/scrape/sessions/[sessionId]
import { NextRequest } from "next/server";
import { getSessionHandler } from "@/modules/knowledge-bases/api/scrape";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  const { kbId, sessionId } = await params;
  return getSessionHandler(req, kbId, sessionId);
}
