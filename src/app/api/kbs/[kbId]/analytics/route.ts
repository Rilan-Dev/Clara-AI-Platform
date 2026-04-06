import { NextRequest } from "next/server";
import { getKbAnalyticsHandler } from "@/modules/knowledge-bases/api/analytics";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return getKbAnalyticsHandler(req, kbId);
}
