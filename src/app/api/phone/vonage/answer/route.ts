/**
 * GET/POST /api/phone/vonage/answer
 *
 * Vonage webhook: incoming call → returns NCCO that tells Vonage
 * to connect the call audio to the clara-engine WebSocket.
 *
 * No AI logic here — just the NCCO redirect.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

async function handle(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const toNumber = searchParams.get("to") ?? "";
  const uuid     = searchParams.get("uuid") ?? `vonage-${Date.now()}`;

  const rows = await query<{ kb_id: string }>(
    `SELECT kb_id FROM phone_configs WHERE phone_number = $1 AND enabled = true LIMIT 1`,
    [toNumber],
  );

  if (!rows.length) {
    return NextResponse.json([{ action: "talk", text: "This number is not configured." }]);
  }

  const kbId = rows[0].kb_id;
  const engineWs = process.env.CLARA_ENGINE_WS_URL
    ?? process.env.CLARA_ENGINE_URL?.replace(/^http/, "ws")
    ?? "ws://localhost:4000";

  const streamUrl = `${engineWs}/ws?type=phone&kbId=${kbId}&provider=vonage&callSid=${uuid}`;

  return NextResponse.json([
    {
      action:    "connect",
      endpoint:  [{ type: "websocket", uri: streamUrl, "content-type": "audio/l16;rate=16000" }],
    },
  ]);
}

export const GET  = handle;
export const POST = handle;
