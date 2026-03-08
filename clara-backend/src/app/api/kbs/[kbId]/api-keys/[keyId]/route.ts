/**
 * PATCH  /api/kbs/[kbId]/api-keys/[keyId]  — update key name/origins/rateLimit
 * DELETE /api/kbs/[kbId]/api-keys/[keyId]  — revoke (soft-delete)
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { revokeApiKey, updateApiKey, getApiKeyById } from "@/modules/embed/core/api-keys-db";

type Props = { params: Promise<{ kbId: string; keyId: string }> };

export async function PATCH(req: NextRequest, { params }: Props): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId, keyId } = await params;

    const existing = await getApiKeyById(keyId);
    if (!existing || existing.kbId !== kbId) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      name?: string;
      allowedOrigins?: string[];
      rateLimitPerHour?: number;
    };

    const updated = await updateApiKey(keyId, {
      name: body.name,
      allowedOrigins: body.allowedOrigins,
      rateLimitPerHour: body.rateLimitPerHour,
    });

    return NextResponse.json({ key: updated });
  } catch (err) {
    console.error("[api-keys] PATCH:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Props): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId, keyId } = await params;

    const existing = await getApiKeyById(keyId);
    if (!existing || existing.kbId !== kbId) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    await revokeApiKey(keyId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api-keys] DELETE:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
