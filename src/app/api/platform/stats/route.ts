import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

/** Platform aggregate analytics only. Tenant activity/details are never returned. */
export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const [orgsR, usersR, subsR, queriesR, kbsR, docsR, monthlyQueriesR, agentsR] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM organisations`),
      query(`SELECT COUNT(*)::int AS count FROM users`),
      query(`SELECT COALESCE(SUM(COALESCE(os.price_snapshot, sp.price_usd)), 0)::int AS mrr,
                    COUNT(os.id)::int AS paying_count
               FROM org_subscriptions os
               JOIN subscription_plans sp ON sp.id = os.plan_id
              WHERE os.status = 'active'
                AND COALESCE(os.price_snapshot, sp.price_usd) > 0`),
      query(`SELECT COUNT(*)::int AS count FROM query_events`),
      query(`SELECT COUNT(*)::int AS count FROM knowledge_bases WHERE status != 'archived'`),
      query(`SELECT COUNT(*)::int AS count FROM documents`),
      query(`SELECT COUNT(*)::int AS count FROM query_events WHERE created_at >= date_trunc('month', now())`),
      query(`SELECT COUNT(*)::int AS count FROM agents WHERE status != 'archived'`),
    ]);
    return NextResponse.json({
      totalOrgs: orgsR[0].count, totalUsers: usersR[0].count, mrr: subsR[0].mrr, payingOrgs: subsR[0].paying_count,
      totalQueries: queriesR[0].count, totalKbs: kbsR[0].count, totalDocuments: docsR[0].count,
      totalQueriesThisMonth: monthlyQueriesR[0].count,
      totalAgents: agentsR[0].count,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/stats]", err);
    return NextResponse.json({ error: "Failed to fetch platform analytics" }, { status: 500 });
  }
}
