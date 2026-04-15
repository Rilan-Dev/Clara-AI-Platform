/**
 * POST /api/chat
 * Proxied to clara-engine — no AI logic lives in this repo.
 */
import { NextRequest } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function POST(req: NextRequest) {
  return engineProxy(req, "/api/chat");
}
