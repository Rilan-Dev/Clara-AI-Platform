/**
 * GET /api/phone/twilio/stream — marker route
 * The actual WebSocket is handled by scripts/start.mjs which intercepts
 * the HTTP upgrade before Next.js sees it.
 * This route exists only so Next.js doesn't 404 on non-WS GET requests.
 */
import { NextResponse } from "next/server";
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, info: "Twilio stream WebSocket endpoint" });
}
