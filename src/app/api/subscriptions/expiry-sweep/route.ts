/**
 * POST /api/subscriptions/expiry-sweep — super-admin only.
 *
 * Manually runs the subscription lifecycle sweep:
 *   • renewal reminder emails for paid subs ending within 7 days
 *   • active/trialing → past_due transition + expiry emails for ended periods
 *
 * Also usable as an external cron target (authenticate with a super-admin
 * session token). The sweep is idempotent — safe to call as often as needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { sweepSubscriptionExpiry } from "@/lib/subscription-expiry";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const result = await sweepSubscriptionExpiry();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/expiry-sweep]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
