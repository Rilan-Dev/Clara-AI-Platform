// GET /api/kbs/[kbId]/scrape/sessions/[sessionId]/discover-progress
import { NextRequest } from "next/server";
import { discoverProgressHandler } from "@/modules/knowledge-bases/api/scrape";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  const { kbId, sessionId } = await params;
  return discoverProgressHandler(req, kbId, sessionId);
}
