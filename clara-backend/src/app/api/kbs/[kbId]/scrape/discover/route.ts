// POST /api/kbs/[kbId]/scrape/discover
import { NextRequest } from "next/server";
import { discoverHandler } from "@/modules/knowledge-bases/api/scrape";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  return discoverHandler(req, kbId);
}
