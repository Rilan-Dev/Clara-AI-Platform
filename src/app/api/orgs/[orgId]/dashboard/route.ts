/**
 * GET /api/orgs/[orgId]/dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * One call powering the organisation Overview dashboard:
 *
 *   • KPI totals          — agents, KBs, documents, storage, members
 *   • Usage               — queries today / 30 days, chat sessions
 *   • queriesPerDay       — last 30 days for the usage chart
 *   • topKnowledgeBases   — by query volume, with document counts
 *   • recentActivity      — latest queries, uploads and conversations
 *   • subscription        — plan + effective lifecycle status (renew/upgrade)
 *
 * Auth: any org member, or a super-admin (membership check, not tenant
 * RBAC — super-admins are allowed here for support/oversight).
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { computeEffectiveSubscription } from "@/lib/subscription-expiry";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId } = await params;

    const auth = await requireAuth(req);

    const membership = await query<{ id: string }>(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id]
    );
    if (!membership[0] && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [orgR, totalsR, perDayR, topKbsR, activityR, subR] = await Promise.all([
      query<{ id: string; name: string; slug: string; logo_url: string | null }>(
        "SELECT id, name, slug, logo_url FROM organisations WHERE id = $1",
        [orgId]
      ),

      query<{
        agent_count: number; kb_count: number; doc_count: number;
        member_count: number; storage_bytes: string;
        queries_today: number; queries_30d: number; queries_prev_30d: number;
        chat_sessions_30d: number; avg_latency_ms: number | null;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM agents WHERE org_id = $1) AS agent_count,
          (SELECT COUNT(*)::int FROM agents p JOIN knowledge_bases kb ON kb.agent_id = p.id WHERE p.org_id = $1) AS kb_count,
          (SELECT COUNT(*)::int FROM documents d JOIN knowledge_bases kb ON kb.id = d.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1) AS doc_count,
          (SELECT COUNT(*)::int FROM org_members WHERE org_id = $1) AS member_count,
          (SELECT COALESCE(SUM(d.file_size), 0)::text FROM documents d JOIN knowledge_bases kb ON kb.id = d.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1) AS storage_bytes,
          (SELECT COUNT(*)::int FROM query_events qe JOIN knowledge_bases kb ON kb.id = qe.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1 AND qe.created_at >= CURRENT_DATE) AS queries_today,
          (SELECT COUNT(*)::int FROM query_events qe JOIN knowledge_bases kb ON kb.id = qe.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1 AND qe.created_at >= now() - INTERVAL '30 days') AS queries_30d,
          (SELECT COUNT(*)::int FROM query_events qe JOIN knowledge_bases kb ON kb.id = qe.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1 AND qe.created_at >= now() - INTERVAL '60 days' AND qe.created_at < now() - INTERVAL '30 days') AS queries_prev_30d,
          (SELECT COUNT(DISTINCT cs.id)::int FROM chat_sessions cs JOIN knowledge_bases kb ON kb.id = cs.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1 AND cs.created_at >= now() - INTERVAL '30 days') AS chat_sessions_30d,
          (SELECT AVG(qe.latency_ms)::int FROM query_events qe JOIN knowledge_bases kb ON kb.id = qe.kb_id JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1 AND qe.created_at >= now() - INTERVAL '30 days') AS avg_latency_ms
      `, [orgId]),

      query<{ day: string; queries: number }>(`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(qe.id)::int AS queries
          FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
          LEFT JOIN query_events qe
            ON qe.kb_id IN (
              SELECT kb.id FROM knowledge_bases kb JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1
            )
           AND qe.created_at >= d.day
           AND qe.created_at < d.day + INTERVAL '1 day'
         GROUP BY d.day
         ORDER BY d.day
      `, [orgId]),

      query<{ kb_id: string; kb_name: string; agent_id: string; agent_name: string; queries_30d: number; doc_count: number; updated_at: string }>(`
        SELECT kb.id AS kb_id, kb.name AS kb_name, p.id AS agent_id, p.name AS agent_name,
               COUNT(qe.id) FILTER (WHERE qe.created_at >= now() - INTERVAL '30 days')::int AS queries_30d,
               (SELECT COUNT(*)::int FROM documents d WHERE d.kb_id = kb.id) AS doc_count,
               kb.updated_at::text AS updated_at
          FROM knowledge_bases kb
          JOIN agents p ON p.id = kb.agent_id
          LEFT JOIN query_events qe ON qe.kb_id = kb.id
         WHERE p.org_id = $1
         GROUP BY kb.id, kb.name, p.id, p.name, kb.updated_at
         ORDER BY queries_30d DESC, kb.name ASC
         LIMIT 5
      `, [orgId]),

      query<{ kind: string; title: string; detail: string | null; created_at: string }>(`
        (SELECT 'query' AS kind,
                LEFT(qe.query_text, 80) AS title,
                (SELECT kb.name FROM knowledge_bases kb WHERE kb.id = qe.kb_id) AS detail,
                qe.created_at::text AS created_at
           FROM query_events qe
          WHERE qe.kb_id IN (SELECT kb.id FROM knowledge_bases kb JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1)
          ORDER BY qe.created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'document' AS kind,
                d.name AS title,
                (SELECT kb.name FROM knowledge_bases kb WHERE kb.id = d.kb_id) AS detail,
                d.created_at::text AS created_at
           FROM documents d
          WHERE d.kb_id IN (SELECT kb.id FROM knowledge_bases kb JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1)
          ORDER BY d.created_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'conversation' AS kind,
                cs.title AS title,
                (SELECT kb.name FROM knowledge_bases kb WHERE kb.id = cs.kb_id) AS detail,
                cs.created_at::text AS created_at
           FROM chat_sessions cs
          WHERE cs.kb_id IN (SELECT kb.id FROM knowledge_bases kb JOIN agents p ON p.id = kb.agent_id WHERE p.org_id = $1)
          ORDER BY cs.created_at DESC LIMIT 5)
        ORDER BY created_at DESC
        LIMIT 8
      `, [orgId]),

      query<Record<string, unknown>>(`
        SELECT os.plan_id, os.status, os.current_period_end,
               COALESCE(pv.name, sp.name) AS plan_name,
               COALESCE(pv.price_usd, sp.price_usd) AS price_usd,
               COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
               COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
               COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
               COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
               COALESCE(pv.features, sp.features) AS features
          FROM org_subscriptions os
          JOIN subscription_plans sp ON sp.id = os.plan_id
          LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
         WHERE os.org_id = $1
         ORDER BY os.updated_at DESC
         LIMIT 1
      `, [orgId]),
    ]);

    const org = orgR[0];
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

    const totals = totalsR[0];
    const sub = subR[0];
    const effective = sub
      ? computeEffectiveSubscription(sub as { plan_id: string; plan_name: string; status: string; current_period_end: string | null })
      : null;

    const queries30d  = totals?.queries_30d ?? 0;
    const queriesPrev = totals?.queries_prev_30d ?? 0;
    const trendPct = queriesPrev > 0
      ? Math.round(((queries30d - queriesPrev) / queriesPrev) * 100)
      : queries30d > 0 ? 100 : 0;

    return NextResponse.json({
      org: { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logo_url },
      totals: {
        agents:        totals?.agent_count ?? 0,
        knowledgeBases: totals?.kb_count ?? 0,
        documents:     totals?.doc_count ?? 0,
        members:       totals?.member_count ?? 0,
        storageBytes:  Number(totals?.storage_bytes ?? 0),
        queriesToday:  totals?.queries_today ?? 0,
        queries30d,
        queriesPrev30d: queriesPrev,
        trendPct,
        chatSessions30d: totals?.chat_sessions_30d ?? 0,
        avgLatencyMs: totals?.avg_latency_ms ?? null,
      },
      queriesPerDay: perDayR,
      topKnowledgeBases: topKbsR,
      recentActivity: activityR,
      subscription: sub ?? null,
      effective,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/orgs/:orgId/dashboard]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
