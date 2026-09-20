/**
 * GET /api/phone/vonage/answer
 * Vonage answer webhook — returns NCCO JSON directing call to our WebSocket.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated }            from "@/lib/db/migrate";
import { getPhoneConfigByNumber }    from "@/modules/phone/core/db";
import { VonageAdapter }             from "@/modules/phone/providers/vonage";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { searchParams } = new URL(req.url);
    const toNumber  = searchParams.get("to")          ?? "";
    const callUuid  = searchParams.get("uuid")        ?? searchParams.get("conversation_uuid") ?? "";

    const config = await getPhoneConfigByNumber(toNumber);
    if (!config?.enabled) {
      return NextResponse.json([{ action: "talk", text: "This number is not configured. Goodbye.", bargeIn: false }]);
    }

    const adapter = new VonageAdapter();
    const wsBase  = APP_URL.replace(/^https?/, "wss");
    const wsUrl   = `${wsBase}/api/phone/vonage/stream`;
    const ncco    = adapter.buildAnswerResponse(wsUrl, callUuid, config);

    console.log(`[phone/vonage] ${callUuid} to ${toNumber} → KB ${config.kbId}`);
    return new NextResponse(ncco, { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[phone/vonage/answer]:", err);
    return NextResponse.json([{ action: "talk", text: "A system error occurred. Please try again.", bargeIn: false }]);
  }
}

// Vonage also POSTs to the answer URL in some configurations
export const POST = GET;
