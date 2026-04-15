/**
 * POST /api/kbs/[kbId]/scrape/discover
 * Triggers the web crawler (BullMQ job) — proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(
  req: NextRequest,
  { params }: { params: { kbId: string } },
) {
  return engineProxy(req, `/api/kbs/${params.kbId}/scrape/discover`);
}
