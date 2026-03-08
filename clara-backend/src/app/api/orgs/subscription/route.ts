import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/** GET /api/orgs/subscription?orgId=xxx  — get org's active subscription + usage */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  try {
    const [subR, usageR] = await Promise.all([
      query(`
        SELECT os.*, sp.*
        FROM org_subscriptions os
        JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE os.org_id = $1
      `, [orgId]),
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM projects p
           JOIN knowledge_bases kb ON kb.project_id = p.id
           WHERE p.org_id = $1) AS kb_count,
          (SELECT COUNT(*)::int FROM query_events qe
           JOIN knowledge_bases kb ON kb.id = qe.kb_id
           JOIN projects p ON p.id = kb.project_id
           WHERE p.org_id = $1
             AND qe.created_at >= CURRENT_DATE) AS requests_today,
          (SELECT COALESCE(SUM(d.file_size), 0)::bigint
           FROM documents d
           JOIN knowledge_bases kb ON kb.id = d.kb_id
           JOIN projects p ON p.id = kb.project_id
           WHERE p.org_id = $1) AS storage_bytes
      `, [orgId]),
    ]);

    if (subR.rows.length === 0) {
      return NextResponse.json({ subscription: null, usage: usageR.rows[0] });
    }

    return NextResponse.json({
      subscription: subR.rows[0],
      usage: usageR.rows[0],
    });
  } catch (err) {
    console.error("[GET /api/orgs/subscription]", err);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}

/** PUT /api/orgs/subscription — update org plan (admin only) */
export async function PUT(req: NextRequest) {
  try {
    const { orgId, planId } = await req.json() as { orgId: string; planId: string };
    if (!orgId || !planId) return NextResponse.json({ error: "orgId and planId required" }, { status: 400 });

    await query(`
      INSERT INTO org_subscriptions (org_id, plan_id, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (org_id) DO UPDATE SET
        plan_id    = EXCLUDED.plan_id,
        status     = 'active',
        updated_at = now()
    `, [orgId, planId]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/orgs/subscription]", err);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}
