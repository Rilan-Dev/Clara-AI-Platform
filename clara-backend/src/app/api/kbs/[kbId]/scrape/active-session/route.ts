// GET /api/kbs/[kbId]/scrape/active-session
import { NextRequest } from "next/server";
import { activeSessionHandler } from "@/modules/knowledge-bases/api/scrape";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kbId: string }> }) {
  const { kbId } = await params;
  return activeSessionHandler(req, kbId);
}
