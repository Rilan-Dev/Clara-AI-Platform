import { NextRequest, NextResponse } from "next/server";
import { getKbAnalyticsHandler } from "@/modules/knowledge-bases/api/analytics";
import { requireAuth, requireTenantScope } from "@/modules/auth/core/rbac";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const { kbId } = await params;
    const auth = await requireAuth(req);
    requireTenantScope(auth);
    return await getKbAnalyticsHandler(req, kbId);
  } catch (err) {
    // requireAuth / requireTenantScope throw NextResponse objects for 401/403 —
    // re-throw them as the response instead of letting them surface as 500s.
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/kbs/:kbId/analytics]", err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
