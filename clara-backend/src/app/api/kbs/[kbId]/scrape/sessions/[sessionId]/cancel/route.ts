import { NextRequest } from "next/server";
import { cancelSessionHandler } from "@/modules/knowledge-bases/api/scrape";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  const { kbId, sessionId } = await params;
  return cancelSessionHandler(req, kbId, sessionId);
}
