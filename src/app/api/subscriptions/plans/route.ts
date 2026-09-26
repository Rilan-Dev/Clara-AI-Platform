import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";

export async function GET() {
  try {
    await ensureMigrated();
    const result = await query(
      `SELECT sp.id,
              COALESCE(pv.name, sp.name) AS name,
              COALESCE(pv.description, sp.description) AS description,
              COALESCE(pv.price_usd, sp.price_usd) AS price_usd,
              COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
              COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
              COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
              COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
              COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
              COALESCE(pv.api_access, sp.api_access) AS api_access,
              COALESCE(pv.custom_branding, sp.custom_branding) AS custom_branding,
              COALESCE(pv.multilingual_embeddings, sp.multilingual_embeddings) AS multilingual_embeddings,
              COALESCE(pv.sso_enabled, sp.sso_enabled) AS sso_enabled,
              COALESCE(pv.analytics_level, sp.analytics_level) AS analytics_level,
              COALESCE(pv.priority_support, sp.priority_support) AS priority_support,
              COALESCE(pv.features, sp.features) AS features,
              pv.version AS plan_version
       FROM subscription_plans sp
       LEFT JOIN LATERAL (
         SELECT * FROM subscription_plan_versions
         WHERE plan_id = sp.id AND status = 'published'
         ORDER BY version DESC LIMIT 1
       ) pv ON TRUE
       ORDER BY COALESCE(pv.price_usd, sp.price_usd) ASC`
    );
    return NextResponse.json({ plans: result });
  } catch (err) {
    console.error("[GET /api/subscriptions/plans]", err);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}
