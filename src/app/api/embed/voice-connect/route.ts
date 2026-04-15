/**
 * POST /api/embed/voice-connect
 * Returns the engine's WebSocket URL for live voice calls.
 * Proxied to clara-engine.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/embed/voice-connect");
}
