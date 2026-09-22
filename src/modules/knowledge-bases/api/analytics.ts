/**
 * src/modules/knowledge-bases/api/analytics.ts
 * GET /api/kbs/[kbId]/analytics → per-KB usage analytics
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKbAnalytics } from "../core/analytics-db";

export async function getKbAnalyticsHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    // The permission query 404s for unknown KBs — no separate existence
    // check needed.
    await requireKbPermission(auth, kbId, "kb:read");

    const analytics = await getKbAnalytics(kbId);
    return NextResponse.json(analytics);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[analytics] getKbAnalytics:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
