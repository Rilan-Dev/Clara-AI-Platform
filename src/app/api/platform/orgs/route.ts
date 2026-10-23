import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

/**
 * Clamp org listing inputs before they reach SQL binds. parseInt silently
 * accepts junk suffixes and yields NaN for malformed strings, while pages
 * whose product overflows Number.MAX_SAFE_INTEGER cannot be represented
 * as exact PostgreSQL OFFSET parameters.
 */
function positivePageNumber(raw: string | null, fallback: number): number {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function organizationPagination(searchParams: URLSearchParams): {
  page: number; perPage: number; offset: number;
} {
  const perPage = Math.min(200, positivePageNumber(searchParams.get("perPage"), 20));
  const requestedPage = positivePageNumber(searchParams.get("page"), 1);
  const offset = (requestedPage - 1) * perPage;
  if (!Number.isSafeInteger(offset)) {
    return { page: 1, perPage, offset: 0 };
  }
  return { page: requestedPage, perPage, offset };
}

/** Platform-admin organisation summaries: profile, aggregate counts, and subscription state only. */
export async function GET(req:NextRequest){
 try{
  await ensureMigrated();const auth=await requireAuth(req);await requireSuperAdmin(auth);const {searchParams}=new URL(req.url);const { page, perPage, offset } = organizationPagination(searchParams);
  const [orgsR,totalR]=await Promise.all([
   query(`SELECT o.id,o.name,o.slug,o.logo_url,o.created_at,COALESCE(pc.agent_count,0)::int AS agent_count,COALESCE(kc.kb_count,0)::int AS kb_count,COALESCE(uc.user_count,0)::int AS user_count,COALESCE(qc.query_count,0)::int AS query_count,COALESCE(sp.id,'free') AS plan_id,COALESCE(os.status,'inactive') AS sub_status,COALESCE(sp.price_usd,0)::int AS price_usd FROM organisations o LEFT JOIN (SELECT org_id,COUNT(*)::int AS agent_count FROM agents GROUP BY org_id) pc ON pc.org_id=o.id LEFT JOIN (SELECT p.org_id,COUNT(kb.id)::int AS kb_count FROM agents p LEFT JOIN knowledge_bases kb ON kb.agent_id=p.id GROUP BY p.org_id) kc ON kc.org_id=o.id LEFT JOIN (SELECT org_id,COUNT(*)::int AS user_count FROM org_members GROUP BY org_id) uc ON uc.org_id=o.id LEFT JOIN (SELECT p.org_id,COUNT(qe.id)::int AS query_count FROM agents p JOIN knowledge_bases kb ON kb.agent_id=p.id LEFT JOIN query_events qe ON qe.kb_id=kb.id GROUP BY p.org_id) qc ON qc.org_id=o.id LEFT JOIN org_subscriptions os ON os.org_id=o.id AND os.status IN ('active','trialing','past_due') LEFT JOIN subscription_plans sp ON sp.id=os.plan_id ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,[perPage,offset]),
   query(`SELECT COUNT(*)::int AS total FROM organisations`),
  ]);
  const total=(totalR as {total:number}[])[0].total;
  return NextResponse.json({orgs:orgsR,total,page,perPage,totalPages:Math.ceil(total/perPage)});
 }catch(err){if(err instanceof NextResponse)return err;console.error("[GET /api/platform/orgs]",err);return NextResponse.json({error:"Failed to fetch organisation summaries"},{status:500});}
}
