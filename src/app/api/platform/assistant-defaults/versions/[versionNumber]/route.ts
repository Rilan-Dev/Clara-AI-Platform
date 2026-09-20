import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  getPlatformAssistantDefaultVersion,
  restorePlatformAssistantDefaultsVersion,
} from "@/modules/ai-core/assistant-defaults-versions-db";

type Params = { params: Promise<{ versionNumber: string }> };

/** GET → version detail · POST → restore as a NEW version (history intact). */

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { versionNumber } = await params;
    const n = Number(versionNumber);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }
    const version = await getPlatformAssistantDefaultVersion(n);
    if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    return NextResponse.json(version);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/assistant-defaults/versions/:n]", err);
    return NextResponse.json({ error: "Failed to load version" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { versionNumber } = await params;
    const n = Number(versionNumber);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: "Invalid version number" }, { status: 400 });
    }
    const version = await restorePlatformAssistantDefaultsVersion(n, auth.user.id);
    return NextResponse.json(version);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/assistant-defaults/versions/:n/restore]", err);
    return NextResponse.json({ error: (err as Error).message || "Failed to restore version" }, { status: 500 });
  }
}
