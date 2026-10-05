import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { listIntegrations } from "@/modules/integrations/registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const rows = await query<{integration_id:string;enabled:boolean;allowed_plans:string[]}>(
      "SELECT integration_id, enabled, allowed_plans FROM platform_integrations ORDER BY integration_id",
    );
    const byId = new Map(rows.map(r => [r.integration_id, r]));
    return NextResponse.json({
      integrations: listIntegrations().map(def => ({
        ...def,
        platformEnabled: byId.get(def.id)?.enabled ?? false,
        allowedPlans: byId.get(def.id)?.allowed_plans ?? [],
      })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integrations]", err);
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json() as { integrationId?: string; enabled?: boolean; allowedPlans?: string[] };
    if (!body.integrationId || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "integrationId and enabled are required" }, { status: 400 });
    }
    const result = await query(
      `UPDATE platform_integrations
          SET enabled = $1,
              allowed_plans = COALESCE($2::jsonb, allowed_plans),
              updated_at = now()
        WHERE integration_id = $3
        RETURNING integration_id, enabled, allowed_plans`,
      [body.enabled, body.allowedPlans ? JSON.stringify(body.allowedPlans) : null, body.integrationId],
    );
    if (!result[0]) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    return NextResponse.json({ integration: result[0] });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integrations PATCH]", err);
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 });
  }
}
