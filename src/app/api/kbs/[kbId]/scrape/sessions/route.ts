// GET /api/kbs/[kbId]/scrape/sessions
import { NextRequest } from "next/server";
import { listSessionsHandler } from "@/modules/knowledge-bases/api/scrape";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  return listSessionsHandler(req, kbId);
}
