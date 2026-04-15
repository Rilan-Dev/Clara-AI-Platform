/**
 * POST /api/realtime/gemini-session
 * Proxied to clara-engine (Gemini Live session config).
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/realtime/gemini-session");
}
