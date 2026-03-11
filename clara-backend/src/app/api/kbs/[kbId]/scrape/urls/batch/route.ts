// PATCH /api/kbs/[kbId]/scrape/urls/batch
import { NextRequest } from "next/server";
import { batchToggleUrlHandler } from "@/modules/knowledge-bases/api/scrape";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  const { kbId } = await params;
  return batchToggleUrlHandler(req, kbId);
}
