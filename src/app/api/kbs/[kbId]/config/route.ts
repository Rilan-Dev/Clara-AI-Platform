import { NextRequest, NextResponse } from "next/server";
import {
  getConfigHandler,
  putConfigHandler,
  patchConfigHandler,
} from "@/modules/knowledge-bases/api/config";
import { requireAuth } from "@/modules/auth/core/rbac";

// Add this helper function to check if user is platform admin
async function denyPlatformAdmin(auth: AuthContext): Promise<void> {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot modify KB configuration" },
      { status: 403 }
    );
  }
}

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return getConfigHandler(req, kbId);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return putConfigHandler(req, kbId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return patchConfigHandler(req, kbId);
}
