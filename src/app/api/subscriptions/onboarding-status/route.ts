import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { queryOne } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    let orgId = new URL(req.url).searchParams.get("orgId");
    if (!orgId && !auth.user.isSuperAdmin) {
      const firstOrg = await queryOne<{ org_id: string }>(
        "SELECT org_id FROM org_members WHERE user_id = $1 ORDER BY id LIMIT 1",
        [auth.user.id],
      );
      orgId = firstOrg?.org_id ?? null;
    }
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id],
    );
    if (!membership && !auth.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const row = await queryOne<{
      plan_id: string; plan_name: string; status: string; payment_status: string; plan_enabled: boolean; plan_price_usd: number;
      payment_verified_at: string | null; activation_review_reason: string | null;
    }>(
      `SELECT os.plan_id, sp.name AS plan_name, os.status, os.payment_status, sp.enabled AS plan_enabled, sp.price_usd AS plan_price_usd,
              os.payment_verified_at::text AS payment_verified_at,
              os.activation_review_reason
         FROM org_subscriptions os
         JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE os.org_id = $1`,
      [orgId],
    );

    return NextResponse.json({
      emailVerified: auth.user.emailVerified,
      orgId,
      onboarding: row ?? null,
      featureAccess: Boolean(
      row &&
      (
        row.plan_price_usd <= 0 ||
        row.payment_status === "paid" ||
        (row.status === "trialing" && row.plan_price_usd > 0)
      ) &&
      (row.status === "active" || row.status === "trialing")
    ),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/subscriptions/onboarding-status]", err);
    return NextResponse.json({ error: "Could not resolve onboarding status" }, { status: 500 });
  }
}
