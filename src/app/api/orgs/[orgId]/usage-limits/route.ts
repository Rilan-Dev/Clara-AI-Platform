import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth } from "@/modules/auth/core/rbac";
import { getOrgUsageSnapshot } from "@/lib/plan-guard";

/**
 * GET /api/orgs/[orgId]/usage-limits
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight usage-vs-plan snapshot for the topbar profile menu.
 *
 * Returns the org's live usage against its effective plan limits:
 *   { plan_id, plan_name, status, downgraded,
 *     usage: { kb_count, doc_count, max_docs_in_kb, storage_bytes,
 *              requests_today, requests_24h, api_keys_active },
 *     limits: { max_kbs, max_docs_per_kb, max_req_day, max_storage_mb, … } }
 *
 * This is the same getOrgUsageSnapshot() that powers the org dashboard, minus
 * every heavy aggregate — the profile menu only needs the meter row values.
 *
 * Auth: any org member, or a super-admin (membership check, not tenant
 * assumption — mirrors the dashboard route).
 */

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
      [orgId, auth.user.id],
    );
    if (!membership[0] && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshot = await getOrgUsageSnapshot(orgId);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load usage limits";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
