/**
 * POST /api/phone/log — internal route to update call log from phone-stream.mjs
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedPhoneInternal } from "@/modules/phone/core/internal-auth";
import { updateCallLog } from "@/modules/phone/core/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedPhoneInternal(req.headers)) {
    return NextResponse.json({ error: "Internal only" }, { status: 403 });
  }
  try {
    const body = await req.json() as Record<string, unknown>;
    const callSid = body.callSid as string;
    if (!callSid) return NextResponse.json({ error: "callSid required" }, { status: 400 });
    await updateCallLog(callSid, {
      status:       (body.status as string) ?? "completed",
      endedAt:      new Date(),
      durationSec:  body.durationSec ? Number(body.durationSec) : undefined,
      turnCount:    body.turnCount   ? Number(body.turnCount)   : undefined,
      transcript:   body.transcript  ? body.transcript          : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
