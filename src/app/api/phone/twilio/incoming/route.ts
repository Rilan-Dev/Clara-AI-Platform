/**
 * POST /api/phone/twilio/incoming
 * Twilio voice webhook — called when a call arrives on a Twilio number.
 * Returns TwiML that connects the call audio to the configured realtime
 * engine:
 *   • voice_engine 'openai'     → <Connect><Stream> to our WebSocket relay
 *     (Clara bridges Twilio ⇄ OpenAI Realtime; unchanged legacy path)
 *   • voice_engine 'elevenlabs'  → the vendor's register-call TwiML
 *     (audio flows Twilio ⇄ ElevenLabs Agents directly — real-time turns,
 *     same KB grounding through the Mode-B RAG server tool)
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPhoneConfigByNumber } from "@/modules/phone/core/db";
import { connectCallViaElevenLabsAgent } from "@/modules/phone/core/elevenlabs-call";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

const HANGUP_TWIML = (message: string) =>
  `<?xml version="1.0"?><Response><Say>${message}</Say><Hangup/></Response>`;

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
        HANGUP_TWIML("This number is not configured for AI assistance. Goodbye."),
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

    // ── ElevenLabs Agents engine: vendor owns turn-taking + audio ────────
    if (config.voiceEngine === "elevenlabs") {
      const result = await connectCallViaElevenLabsAgent({
        config,
        callSid,
        fromNumber,
        toNumber,
      });
      if (result.ok) {
        console.log(`[phone/twilio] ${callSid} from ${fromNumber} → ElevenLabs agent (KB ${config.kbId})`);
        return new NextResponse(result.twiml, { headers: { "Content-Type": "text/xml" } });
      }
      console.error(`[phone/twilio] ElevenLabs engine refused: ${result.reason}`);
      return new NextResponse(
        HANGUP_TWIML("The AI assistant is temporarily unavailable. Please try again later."),
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // ── OpenAI Realtime engine: legacy Clara relay ────────────────────
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
      HANGUP_TWIML("A system error occurred. Please try again."),
      { headers: { "Content-Type": "text/xml" } }
    );
  }
}
