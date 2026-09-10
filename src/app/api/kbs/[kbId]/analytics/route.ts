import { NextRequest, NextResponse } from "next/server";
import { getKbAnalyticsHandler } from "@/modules/knowledge-bases/api/analytics";
import { requireAuth } from "@/modules/auth/core/rbac";
import { AuthContext } from "@/modules/auth/core/models";

// Add this helper function to check if user is platform admin
async function denyPlatformAdmin(auth: AuthContext): Promise<void> {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot access KB analytics" },
      { status: 403 }
    );
  }
}

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  const auth = await requireAuth(req);
  await denyPlatformAdmin(auth); // Add this check
  return getKbAnalyticsHandler(req, kbId);
}
