/**
 * GET /api/orgs/billing-history?orgId=xxx&limit=50
 * Returns billing events + subscription audit log for an org.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") ?? "50") || 50);
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  try {
    await ensureMigrated();
    const auth = await requireAuth(req);

    // Org members see THEIR OWN org's billing history; super-admins see all.
    if (!auth.user.isSuperAdmin) {
      const membership = await query(
        "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
        [orgId, auth.user.id]
      );
      if (!membership[0]) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [invoices, auditLog] = await Promise.all([
      // Billing events (actual payments)
      query<{
        id: string; gateway: string; event_type: string;
        plan_id: string | null; amount_cents: number | null; amount_paise: number | null;
        currency: string; status: string; created_at: string; metadata: Record<string, unknown>;
      }>(`
        SELECT id, gateway, event_type, plan_id,
               amount_cents, amount_paise, currency, status, created_at, metadata
        FROM billing_events
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [orgId, limit]),

      // Admin/system subscription changes
      query<{
        id: string; actor_label: string; action: string;
        old_plan_id: string | null; new_plan_id: string | null;
        old_status: string | null; new_status: string | null;
        note: string | null; created_at: string;
      }>(`
        SELECT sal.id, sal.actor_label, sal.action,
               sal.old_plan_id, sal.new_plan_id, sal.old_status, sal.new_status,
               sal.note, sal.created_at
        FROM subscription_audit_log sal
        WHERE sal.org_id = $1
        ORDER BY sal.created_at DESC
        LIMIT $2
      `, [orgId, limit]),
    ]);

    return NextResponse.json({ invoices, auditLog, orgId, limit });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/orgs/billing-history]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
