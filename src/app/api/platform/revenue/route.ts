import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated(); const auth=await requireAuth(req); await requireSuperAdmin(auth);
    const [byPlanR,mrrTrendR,planDistR]=await Promise.all([
      query(`SELECT sp.id AS plan_id,sp.name AS plan_name,sp.price_usd,COUNT(os.id)::int AS org_count,COALESCE(SUM(sp.price_usd),0)::int AS plan_mrr FROM subscription_plans sp LEFT JOIN org_subscriptions os ON os.plan_id=sp.id AND os.status='active' GROUP BY sp.id,sp.name,sp.price_usd ORDER BY sp.price_usd DESC`),
      query(`SELECT to_char(date_trunc('month',os.created_at),'Mon YYYY') AS month,date_trunc('month',os.created_at) AS month_ts,COUNT(os.id)::int AS new_subs,COALESCE(SUM(sp.price_usd),0)::int AS added_mrr FROM org_subscriptions os JOIN subscription_plans sp ON sp.id=os.plan_id WHERE sp.price_usd>0 AND os.created_at>=now()-INTERVAL '6 months' GROUP BY date_trunc('month',os.created_at),to_char(date_trunc('month',os.created_at),'Mon YYYY') ORDER BY month_ts ASC`),
      query(`SELECT COALESCE(os.plan_id,'free') AS plan_id,COUNT(o.id)::int AS count FROM organisations o LEFT JOIN org_subscriptions os ON os.org_id=o.id GROUP BY COALESCE(os.plan_id,'free') ORDER BY count DESC`),
    ]);
    const totalMrr=(byPlanR as {plan_mrr:number;price_usd:number}[]).reduce((s,r)=>r.price_usd>0?s+r.plan_mrr:s,0);
    return NextResponse.json({totalMrr,totalArr:totalMrr*12,byPlan:byPlanR,mrrTrend:mrrTrendR,planDist:planDistR});
  }catch(err){if(err instanceof NextResponse)return err;console.error("[GET /api/platform/revenue]",err);return NextResponse.json({error:"Failed to fetch revenue data"},{status:500});}
}
