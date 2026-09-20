import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  getPlatformAssistantDefaultsState,
  putPlatformAssistantDefaultsDraft,
} from "@/modules/ai-core/assistant-defaults-versions-db";

/** GET → current + draft state · PUT → save the mutable draft. */

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const state = await getPlatformAssistantDefaultsState();
    return NextResponse.json(state);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/assistant-defaults/draft]", err);
    return NextResponse.json({ error: "Failed to load default assistant state" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const config = body.configuration as { assistant?: Record<string, unknown> } | undefined;
    if (!config?.assistant || typeof config.assistant.assistantName !== "string") {
      return NextResponse.json({ error: "configuration.assistant is required" }, { status: 400 });
    }
    await putPlatformAssistantDefaultsDraft(
      config as Parameters<typeof putPlatformAssistantDefaultsDraft>[0],
      auth.user.id,
    );
    const state = await getPlatformAssistantDefaultsState();
    return NextResponse.json(state);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/platform/assistant-defaults/draft]", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to save draft" }, { status: 500 });
  }
}
