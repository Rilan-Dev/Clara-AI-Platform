import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { queryOne } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const orgId = new URL(req.url).searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id],
    );
    if (!membership && !auth.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const row = await queryOne<{
      plan_id: string; plan_name: string; status: string; payment_status: string;
      payment_verified_at: string | null; activation_review_reason: string | null;
    }>(
      `SELECT os.plan_id, sp.name AS plan_name, os.status, os.payment_status,
              os.payment_verified_at::text AS payment_verified_at,
              os.activation_review_reason
         FROM org_subscriptions os
         JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE os.org_id = $1`,
      [orgId],
    );

    return NextResponse.json({
      emailVerified: auth.user.emailVerified,
      onboarding: row ?? null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/subscriptions/onboarding-status]", err);
    return NextResponse.json({ error: "Could not resolve onboarding status" }, { status: 500 });
  }
}
