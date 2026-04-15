/**
 * GET /api/voice/provider
 * Proxied to clara-engine (returns which voice provider the KB uses).
 */
import { NextRequest } from "next/server";
import { engineProxyGet } from "@/lib/engine-proxy";

export async function GET(req: NextRequest) {
  return engineProxyGet(req, "/api/voice/provider");
}
