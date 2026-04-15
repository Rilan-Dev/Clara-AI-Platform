/**
 * GET /api/phone/session
 *
 * Returns the engine WebSocket URL for a phone call stream.
 * The client (Twilio/Vonage webhook handler) uses this to know where
 * to redirect the media stream WebSocket.
 *
 * Query params: kbId, provider (twilio|vonage), callSid
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const kbId     = searchParams.get("kbId");
  const provider = searchParams.get("provider") ?? "twilio";
  const callSid  = searchParams.get("callSid") ?? `call-${Date.now()}`;

  if (!kbId) {
    return NextResponse.json({ error: "kbId required" }, { status: 400 });
  }

  const engineWs = process.env.CLARA_ENGINE_WS_URL
    ?? process.env.CLARA_ENGINE_URL?.replace(/^http/, "ws")
    ?? "ws://localhost:4000";

  return NextResponse.json({
    wsUrl: `${engineWs}/ws?type=phone&kbId=${kbId}&provider=${provider}&callSid=${callSid}`,
  });
}
