/**
 * POST /api/phone/twilio/incoming
 * Twilio voice webhook — called when a call arrives on a Twilio number.
 * Returns TwiML that connects the call audio to our WebSocket stream.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPhoneConfigByNumber } from "@/modules/phone/core/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const toNumber = params.get("To") ?? "";
    const callSid = params.get("CallSid") ?? "";
    const fromNumber = params.get("From") ?? "";

    const config = await getPhoneConfigByNumber(toNumber);
    if (!config?.enabled) {
      return new NextResponse(
        `<?xml version="1.0"?><Response><Say>This number is not configured for AI assistance. Goodbye.</Say><Hangup/></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Verify Twilio signature — only when TWILIO_VERIFY_WEBHOOK=true is explicitly set.
    // Twilio signs with HMAC-SHA1(authToken, fullUrl + sortedPostParams).
    // Skip by default so misconfigured APP_URL doesn't block real calls.
    if (process.env.TWILIO_VERIFY_WEBHOOK === "true" && process.env.TWILIO_AUTH_TOKEN) {
      const twilioSig = req.headers.get("x-twilio-signature") ?? "";
      const fullUrl = `${APP_URL}/api/phone/twilio/incoming`;
      const params2 = new URLSearchParams(rawBody);
      const sortedStr = [...params2.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}${v}`)
        .join("");
      const { createHmac } = await import("node:crypto");
      const expected = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN)
        .update(fullUrl + sortedStr)
        .digest("base64");
      if (twilioSig !== expected) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const wsBase = APP_URL.replace(/^https?/, "wss");
    const wsUrl = `${wsBase}/api/phone/twilio/stream`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="callSid" value="${callSid}" />
      <Parameter name="kbId" value="${config.kbId}" />
    </Stream>
  </Connect>
</Response>`;

    console.log(`[phone/twilio] ${callSid} from ${fromNumber} → KB ${config.kbId}`);
    return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("[phone/twilio/incoming]:", err);
    return new NextResponse(
      `<?xml version="1.0"?><Response><Say>A system error occurred. Please try again.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }
}
