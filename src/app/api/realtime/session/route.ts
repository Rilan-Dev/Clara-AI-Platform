/**
 * POST /api/realtime/session
 * Proxied to clara-engine (OpenAI Realtime ephemeral token).
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/realtime/session");
}
