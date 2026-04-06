import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/** GET /api/platform/stats — super-admin platform overview */
export async function GET() {
  try {
    const [orgsR, usersR, subsR, queriesR, kbsR, docsR, recentR] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM organisations`),
      query(`SELECT COUNT(*)::int AS count FROM users`),
      query(`
        SELECT
          COALESCE(SUM(sp.price_usd), 0)::int AS mrr,
          COUNT(os.id)::int AS paying_count
        FROM org_subscriptions os
        JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE os.status = 'active' AND sp.price_usd > 0
      `),
      query(`SELECT COUNT(*)::int AS count FROM query_events`),
      query(`SELECT COUNT(*)::int AS count FROM knowledge_bases WHERE status != 'archived'`),
      query(`SELECT COUNT(*)::int AS count FROM documents`),
      // Recent activity from audit_logs if exists, else query_events
      query(`
        SELECT kb.name AS kb_name, o.name AS org_name, qe.query_text, qe.created_at
        FROM query_events qe
        JOIN knowledge_bases kb ON kb.id = qe.kb_id
        JOIN projects p ON p.id = kb.project_id
        JOIN organisations o ON o.id = p.org_id
        ORDER BY qe.created_at DESC
        LIMIT 10
      `).catch(() => ([])),
    ]);

    // Monthly queries (this month)
    const monthlyQueriesR = await query(`
      SELECT COUNT(*)::int AS count FROM query_events
      WHERE created_at >= date_trunc('month', now())
    `).catch(() => ([{ count: 0 }]));

    return NextResponse.json({
      totalOrgs:           orgsR[0].count,
      totalUsers:          usersR[0].count,
      mrr:                 subsR[0].mrr,
      payingOrgs:          subsR[0].paying_count,
      totalQueries:        queriesR[0].count,
      totalKbs:            kbsR[0].count,
      totalDocuments:      docsR[0].count,
      totalQueriesThisMonth: monthlyQueriesR[0].count,
      recentActivity:      (recentR as unknown[]) ?? [],
    });
  } catch (err) {
    console.error("[GET /api/platform/stats]", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
