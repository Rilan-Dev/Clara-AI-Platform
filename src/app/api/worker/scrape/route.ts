/**
 * POST /api/worker/scrape
 * GET  /api/worker/scrape
 * Proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/worker/scrape");
}

export async function GET(req: NextRequest) {
  return engineProxy(req, "/api/worker/scrape");
}
