/**
 * POST /api/embed/voice-init
 * Proxied to clara-engine (returns ephemeral OpenAI Realtime token).
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/embed/voice-init");
}
