import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";

const FREE_PLAN_FALLBACK = {
  plan_id: "free",
  plan_name: "Free",
  status: "active",
  max_kbs: 1,
  max_docs_per_kb: 10,
  max_req_day: 100,
  max_storage_mb: 100,
  voice_enabled: false,
  api_access: false,
  custom_branding: false,
  analytics_level: "basic",
  features: ["1 Knowledge Base", "10 documents", "100 requests/day"],
};

/** GET /api/orgs/subscription?orgId=xxx — get org's active subscription + usage */
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  try {
    await ensureMigrated();

    // Run subscription lookup and usage stats in parallel
    const [subR, usageR] = await Promise.all([
      query(`
        SELECT
          os.id, os.org_id, os.plan_id, os.status,
          os.current_period_start, os.current_period_end,
          os.cancel_at_period_end,
          sp.name           AS plan_name,
          sp.max_kbs,
          sp.max_docs_per_kb,
          sp.max_req_day,
          sp.max_storage_mb,
          sp.voice_enabled,
          sp.api_access,
          sp.custom_branding,
          sp.analytics_level,
          sp.features
        FROM org_subscriptions os
        JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE os.org_id = $1
          AND os.status IN ('active', 'trialing')
        LIMIT 1
      `, [orgId]),

      query(`
        SELECT
          (SELECT COUNT(*)::int
             FROM projects p
             JOIN knowledge_bases kb ON kb.project_id = p.id
            WHERE p.org_id = $1)                              AS kb_count,
          (SELECT COUNT(*)::int
             FROM query_events qe
             JOIN knowledge_bases kb ON kb.id  = qe.kb_id
             JOIN projects       p  ON p.id   = kb.project_id
            WHERE p.org_id = $1
              AND qe.created_at >= CURRENT_DATE)              AS requests_today,
          (SELECT COALESCE(SUM(d.file_size), 0)::bigint
             FROM documents       d
             JOIN knowledge_bases kb ON kb.id  = d.kb_id
             JOIN projects        p  ON p.id   = kb.project_id
            WHERE p.org_id = $1)                              AS storage_bytes
      `, [orgId]),
    ]);

    // If the org has no subscription row yet, return the free-plan fallback
    // so the dashboard can still render instead of crashing.
    const subscription = subR[0] ?? FREE_PLAN_FALLBACK;
    const usage = usageR[0] ?? { kb_count: 0, requests_today: 0, storage_bytes: 0 };

    return NextResponse.json({ subscription, usage });

  } catch (err) {
    console.error("[GET /api/orgs/subscription]", err);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}

/** PUT /api/orgs/subscription — upsert org plan */
export async function PUT(req: NextRequest) {
  try {
    await ensureMigrated();
    const { orgId, planId } = await req.json() as { orgId: string; planId: string };
    if (!orgId || !planId) {
      return NextResponse.json({ error: "orgId and planId required" }, { status: 400 });
    }

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
