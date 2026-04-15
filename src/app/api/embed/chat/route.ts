/**
 * POST /api/embed/chat
 * OPTIONS /api/embed/chat  (CORS preflight — handled here, not in engine)
 * Proxied to clara-engine.
 */
import { NextRequest, NextResponse } from "next/server";
import { engineProxy } from "@/lib/engine-proxy";

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age":       "86400",
    },
  });
}

export async function POST(req: NextRequest) {
  const res = await engineProxy(req, "/api/embed/chat");
  // Re-attach CORS headers so browser widgets work
  const origin = req.headers.get("origin") ?? "*";
  res.headers.set("Access-Control-Allow-Origin", origin);
  return res;
}
