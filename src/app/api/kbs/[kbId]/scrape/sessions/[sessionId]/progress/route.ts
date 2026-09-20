// GET /api/kbs/[kbId]/scrape/sessions/[sessionId]/progress
import { NextRequest } from "next/server";
import { progressHandler } from "@/modules/knowledge-bases/api/scrape";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  const { kbId, sessionId } = await params;
  return progressHandler(req, kbId, sessionId);
}
