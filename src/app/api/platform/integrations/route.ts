import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getIntegration, listIntegrations } from "@/modules/integrations/registry";
import { isPlatformConfigured } from "@/modules/integrations/platform-credentials";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const [rows, oauthApps, credentials] = await Promise.all([
      query<{integration_id:string;enabled:boolean;allowed_plans:string[]}>(
        "SELECT integration_id, enabled, allowed_plans FROM platform_integrations ORDER BY integration_id",
      ),
      query<{integration_id:string}>("SELECT integration_id FROM platform_integration_oauth_apps"),
      query<{integration_id:string}>("SELECT integration_id FROM platform_integration_credentials"),
    ]);
    const byId = new Map(rows.map(r => [r.integration_id, r]));
    const oauthIds = new Set(oauthApps.map(r => r.integration_id));
    const credentialIds = new Set(credentials.map(r => r.integration_id));
    return NextResponse.json({
      integrations: listIntegrations().map(def => {
        const configured = isPlatformConfigured(def, {
          hasOAuthApp: oauthIds.has(def.id),
          hasCredentials: credentialIds.has(def.id),
        });
        return {
          ...def,
          platformEnabled: byId.get(def.id)?.enabled ?? false,
          allowedPlans: byId.get(def.id)?.allowed_plans ?? [],
          configured,
        };
      }),
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
    const def = getIntegration(body.integrationId);
    if (!def) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    if (body.enabled) {
      // Gate from migration 071 / the doable-source control plane: an
      // integration can only be enabled after the platform admin configured
      // it (OAuth app or platform credentials).
      const state = await (async () => {
        const [oauthApp, credential] = await Promise.all([
          query<{present:boolean}>(
            "SELECT TRUE AS present FROM platform_integration_oauth_apps WHERE integration_id = $1",
            [body.integrationId],
          ),
          query<{present:boolean}>(
            "SELECT TRUE AS present FROM platform_integration_credentials WHERE integration_id = $1",
            [body.integrationId],
          ),
        ]);
        return { hasOAuthApp: Boolean(oauthApp[0]?.present), hasCredentials: Boolean(credential[0]?.present) };
      })();
      if (!isPlatformConfigured(def, state)) {
        return NextResponse.json(
          {
            error: "Configure this integration before enabling it for organisations",
            code: "INTEGRATION_NOT_CONFIGURED",
          },
          { status: 400 },
        );
      }
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
