// PATCH /api/kbs/[kbId]/scrape/urls/[urlId]
import { NextRequest } from "next/server";
import { toggleUrlHandler } from "@/modules/knowledge-bases/api/scrape";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; urlId: string }> }
) {
  const { kbId, urlId } = await params;
  return toggleUrlHandler(req, kbId, urlId);
}
