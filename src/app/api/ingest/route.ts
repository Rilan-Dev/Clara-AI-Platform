/**
 * POST /api/ingest
 * GET  /api/ingest
 * Proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/ingest");
}

export async function GET(req: NextRequest) {
  return engineProxy(req, "/api/ingest");
}
