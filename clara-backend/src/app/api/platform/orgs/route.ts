import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/** GET /api/platform/orgs?page=1&perPage=20 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page    = Math.max(1, parseInt(searchParams.get("page")    ?? "1"));
  const perPage = Math.min(100, parseInt(searchParams.get("perPage") ?? "20"));
  const offset  = (page - 1) * perPage;

  try {
    const [orgsR, totalR] = await Promise.all([
      query(`
        SELECT
          o.id, o.name, o.slug, o.logo_url, o.created_at,
          os.plan_id, os.status AS sub_status,
          sp.price_usd,
          COALESCE(kb_counts.kb_count, 0)::int  AS kb_count,
          COALESCE(user_counts.user_count, 0)::int AS user_count,
          COALESCE(query_counts.query_count, 0)::int AS query_count
        FROM organisations o
        LEFT JOIN org_subscriptions os ON os.org_id = o.id
        LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
        LEFT JOIN (
          SELECT p.org_id, COUNT(kb.id)::int AS kb_count
          FROM projects p LEFT JOIN knowledge_bases kb ON kb.project_id = p.id
          GROUP BY p.org_id
        ) kb_counts ON kb_counts.org_id = o.id
        LEFT JOIN (
          SELECT org_id, COUNT(*)::int AS user_count FROM org_members GROUP BY org_id
        ) user_counts ON user_counts.org_id = o.id
        LEFT JOIN (
          SELECT kb.project_id,
                 p.org_id,
                 COUNT(qe.id)::int AS query_count
          FROM query_events qe
          JOIN knowledge_bases kb ON kb.id = qe.kb_id
          JOIN projects p ON p.id = kb.project_id
          GROUP BY kb.project_id, p.org_id
        ) query_counts ON query_counts.org_id = o.id
        ORDER BY o.created_at DESC
        LIMIT $1 OFFSET $2
      `, [perPage, offset]),
      query(`SELECT COUNT(*)::int AS total FROM organisations`),
    ]);

    return NextResponse.json({
      orgs: orgsR,
      total: (totalR as { total: number }[])[0].total,
      page,
      perPage,
      totalPages: Math.ceil((totalR as { total: number }[])[0].total / perPage),
    });
  } catch (err) {
    console.error("[GET /api/platform/orgs]", err);
    return NextResponse.json({ error: "Failed to fetch orgs" }, { status: 500 });
  }
}
