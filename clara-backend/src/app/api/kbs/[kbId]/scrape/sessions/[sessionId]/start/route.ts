// POST /api/kbs/[kbId]/scrape/sessions/[sessionId]/start
import { NextRequest } from "next/server";
import { startScrapeHandler } from "@/modules/knowledge-bases/api/scrape";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  const { kbId, sessionId } = await params;
  return startScrapeHandler(req, kbId, sessionId);
}
