/**
 * POST /api/phone/vonage/event
 * Vonage event webhook — receives call status updates.
 */
import { NextRequest, NextResponse } from "next/server";
import { updateCallLog } from "@/modules/phone/core/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as Record<string, unknown>;
    const uuid   = body.uuid as string ?? body.conversation_uuid as string ?? "";
    const status = body.status as string ?? "";

    if (uuid && status) {
      const mappedStatus =
        status === "completed" ? "completed" :
        status === "failed"    ? "failed"    :
        status === "busy"      ? "busy"      :
        status === "timeout"   ? "no-answer" : undefined;

      if (mappedStatus) {
        await updateCallLog(uuid, {
          status: mappedStatus,
          ...(mappedStatus === "completed" ? { endedAt: new Date() } : {}),
        }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
