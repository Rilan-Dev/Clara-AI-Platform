/**
 * GET /api/phone/vonage/stream — marker route
 * Actual WebSocket handled by scripts/start.mjs.
 */
import { NextResponse } from "next/server";
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, info: "Vonage stream WebSocket endpoint" });
}
