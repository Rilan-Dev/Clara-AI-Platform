/**
 * POST /api/embed/search
 * Proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/embed/search");
}
