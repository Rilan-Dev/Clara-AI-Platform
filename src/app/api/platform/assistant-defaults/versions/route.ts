import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  listPlatformAssistantDefaultVersions,
  savePlatformAssistantDefaultsVersion,
} from "@/modules/ai-core/assistant-defaults-versions-db";

/**
 * Platform Default Assistant version history (immutable versions).
 * GET  → list versions (newest first)
 * POST → save the current draft as a NEW immutable version (becomes current)
 */

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const versions = await listPlatformAssistantDefaultVersions();
    return NextResponse.json({ versions });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/assistant-defaults/versions]", err);
    return NextResponse.json({ error: "Failed to list default assistant versions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const changeSummary = typeof body.changeSummary === "string" ? body.changeSummary : null;
    const version = await savePlatformAssistantDefaultsVersion({ changeSummary }, auth.user.id);
    return NextResponse.json(version);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/assistant-defaults/versions]", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to save version" }, { status: 500 });
  }
}
