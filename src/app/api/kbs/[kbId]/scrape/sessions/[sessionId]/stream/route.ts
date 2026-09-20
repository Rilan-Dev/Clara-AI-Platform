import { NextRequest } from "next/server";
import { streamHandler } from "@/modules/knowledge-bases/api/scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
) {
  const { kbId, sessionId } = await params;
  return streamHandler(req, kbId, sessionId);
}
