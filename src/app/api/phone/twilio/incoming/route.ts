/**
 * POST /api/phone/twilio/incoming
 *
 * Twilio webhook: incoming call → returns TwiML that tells Twilio
 * to open a media stream to the clara-engine WebSocket.
 *
 * The AI call handling (CallHandler) runs entirely in clara-engine.
 * This route only produces the TwiML redirect — no AI logic here.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body     = await req.text();
  const params   = new URLSearchParams(body);
  const callSid  = params.get("CallSid") ?? "unknown";
  const toNumber = params.get("To") ?? "";

  // Look up which KB is configured for this phone number
  const rows = await query<{ kb_id: string }>(
    `SELECT kb_id FROM phone_configs WHERE phone_number = $1 AND enabled = true LIMIT 1`,
    [toNumber],
  );

  if (!rows.length) {
    return new NextResponse(
      `<?xml version="1.0"?><Response><Reject reason="rejected"/></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  const kbId = rows[0].kb_id;
  const engineWs = process.env.CLARA_ENGINE_WS_URL
    ?? process.env.CLARA_ENGINE_URL?.replace(/^http/, "ws")
    ?? "ws://localhost:4000";

  const streamUrl = `${engineWs}/ws?type=phone&kbId=${kbId}&provider=twilio&callSid=${callSid}`;

  const twiml = `<?xml version="1.0"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;

  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
