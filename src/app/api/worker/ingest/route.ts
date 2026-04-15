/**
 * POST /api/worker/ingest
 * GET  /api/worker/ingest
 * Proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/worker/ingest");
}

export async function GET(req: NextRequest) {
  return engineProxy(req, "/api/worker/ingest");
}
