import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

/**
 * Current dashboard revenue and plan distribution.
 *
 * Use the price captured on the organisation's subscription, not the mutable
 * plan catalogue price; the latter may change without repricing existing
 * customers. Inactive/onboarding subscriptions are free in the current
 * distribution, matching the platform's active-subscription billing rule.
 */
export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const [byPlanR, mrrTrendR, planDistR] = await Promise.all([
      query(`
        SELECT sp.id AS plan_id, sp.name AS plan_name, sp.price_usd,
               COUNT(os.id)::int AS org_count,
               COALESCE(SUM(
                 CASE WHEN COALESCE(os.price_snapshot, sp.price_usd) > 0
                   THEN COALESCE(os.price_snapshot, sp.price_usd)
                   ELSE 0 END
               ), 0)::int AS plan_mrr
          FROM subscription_plans sp
          LEFT JOIN org_subscriptions os
            ON os.plan_id = sp.id AND os.status = 'active'
         GROUP BY sp.id, sp.name, sp.price_usd
         ORDER BY sp.price_usd DESC
      `),
      // Historical cohort chart retains its existing definition. A fully
      // reconstructed billed MRR timeline requires the billing/audit ledger,
      // rather than relying on mutable current subscription status.
      query(`
        SELECT to_char(date_trunc('month', os.created_at), 'Mon YYYY') AS month,
               date_trunc('month', os.created_at) AS month_ts,
               COUNT(os.id)::int AS new_subs,
               COALESCE(SUM(sp.price_usd), 0)::int AS added_mrr
          FROM org_subscriptions os
          JOIN subscription_plans sp ON sp.id = os.plan_id
         WHERE sp.price_usd > 0
           AND os.created_at >= now() - INTERVAL '6 months'
         GROUP BY date_trunc('month', os.created_at),
                  to_char(date_trunc('month', os.created_at), 'Mon YYYY')
         ORDER BY month_ts ASC
      `),
      query(`
        SELECT COALESCE(os.plan_id, 'free') AS plan_id,
               COUNT(o.id)::int AS count
          FROM organisations o
          LEFT JOIN org_subscriptions os
            ON os.org_id = o.id
           AND os.status IN ('active', 'trialing')
         GROUP BY COALESCE(os.plan_id, 'free')
         ORDER BY count DESC
      `),
    ]);
    // All plan_mrr values are nonnegative and already exclude inactive rows.
    // Enterprise plans with negotiated positive price snapshots are included.
    const totalMrr = (byPlanR as { plan_mrr: number }[]).reduce(
      (sum, row) => sum + row.plan_mrr,
      0,
    );
    return NextResponse.json({
      totalMrr,
      totalArr: totalMrr * 12,
      byPlan: byPlanR,
      mrrTrend: mrrTrendR,
      planDist: planDistR,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/revenue]", err);
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
