import { NextRequest, NextResponse } from "next/server";
import {
  getKBAIOverridesHandler,
  patchKBAIOverridesHandler,
} from "@/modules/knowledge-bases/api/ai-overrides";
import { requireAuth } from "@/modules/auth/core/rbac";
import { AuthContext } from "@/modules/auth/core/models";

// Add this helper function to check if user is platform admin
async function denyPlatformAdmin(auth: AuthContext): Promise<void> {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot modify KB AI overrides" },
      { status: 403 }
    );
  }
}

type Params = { params: Promise<{ kbId: string }> };

export async function GET(
  req: NextRequest,
  { params }: Params,
) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return getKBAIOverridesHandler(req, kbId);
}

export async function PATCH(
  req: NextRequest,
  { params }: Params,
) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return patchKBAIOverridesHandler(req, kbId);
}
