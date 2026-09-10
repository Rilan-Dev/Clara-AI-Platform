import { NextRequest, NextResponse } from "next/server";
import {
  listSnapshotsHandler,
  createSnapshotHandler,
} from "@/modules/knowledge-bases/api/snapshots";
import { requireAuth } from "@/modules/auth/core/rbac";

// Add this helper function to check if user is platform admin
async function denyPlatformAdmin(auth: AuthContext): Promise<void> {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot manage KB snapshots" },
      { status: 403 }
    );
  }
}

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return listSnapshotsHandler(req, kbId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return createSnapshotHandler(req, kbId);
}
