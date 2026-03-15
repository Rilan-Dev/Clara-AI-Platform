/**
 * GET  /api/kbs/[kbId]/phone  — list phone configs for a KB
 * POST /api/kbs/[kbId]/phone  — create/update phone config
 * DELETE /api/kbs/[kbId]/phone?id=xxx — delete a config
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated }      from "@/lib/db/migrate";
import {
  getPhoneConfigsByKb,
  upsertPhoneConfig,
  deletePhoneConfig,
  checkPhoneCallsEnabled,
} from "@/modules/phone/core/db";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId } = await params;
    const [configs, enabled] = await Promise.all([
      getPhoneConfigsByKb(kbId),
      checkPhoneCallsEnabled(kbId),
    ]);
    return NextResponse.json({ configs, phoneCallsEnabled: enabled });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId } = await params;

    // Subscription gate
    const enabled = await checkPhoneCallsEnabled(kbId);
    if (!enabled) {
      return NextResponse.json(
        { error: "Phone calls are not included in your subscription plan. Upgrade to Pro or Enterprise." },
        { status: 403 }
      );
    }

    const body   = await req.json() as Record<string, unknown>;
    const config = await upsertPhoneConfig(kbId, {
      provider:           (body.provider === "vonage" ? "vonage" : "twilio"),
      enabled:            Boolean(body.enabled ?? false),
      phoneNumber:        body.phoneNumber ? String(body.phoneNumber).trim() : null,
      greetingMessage:    body.greetingMessage ? String(body.greetingMessage).trim() : "Hello! How can I help you today?",
      maxCallDurationSec: body.maxCallDurationSec ? Math.min(Math.max(Number(body.maxCallDurationSec), 30), 3600) : 300,
      recordCalls:        Boolean(body.recordCalls ?? false),
      transcribeCalls:    Boolean(body.transcribeCalls ?? true),
      webhookUrlOverride: body.webhookUrlOverride ? String(body.webhookUrlOverride).trim() : null,
    });
    return NextResponse.json({ config });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId } = await params;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    void kbId; // used by auth context
    await deletePhoneConfig(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
