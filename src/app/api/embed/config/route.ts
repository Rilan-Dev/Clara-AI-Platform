/**
 * GET /api/embed/config
 * Proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxyGet } from "@/lib/engine-proxy";

export async function GET(req: NextRequest) {
  return engineProxyGet(req, "/api/embed/config");
}
