import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getIntegration } from "@/modules/integrations/registry";
import {
  platformCredentialFields,
  requiresPlatformCredentials,
  validatePlatformCredentialInput,
} from "@/modules/integrations/platform-credentials";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ integrationId: string }> };

/** GET — configuration state + the derived field list for the configure dialog.
 *  Never returns decrypted secret material. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { integrationId } = await params;
    const definition = getIntegration(integrationId);
    if (!definition || !requiresPlatformCredentials(definition)) {
      return NextResponse.json(
        { error: "This integration does not use platform-managed credentials" },
        { status: 404 },
      );
    }
    const row = (await query<{auth_type:string; display_hint:string|null; updated_at:Date}>(
      `SELECT auth_type, display_hint, updated_at
         FROM platform_integration_credentials
        WHERE integration_id = $1`,
      [integrationId],
    ))[0];
    return NextResponse.json({
      integrationId,
      authType: definition.authType,
      configured: Boolean(row),
      displayHint: row?.display_hint ?? null,
      updatedAt: row?.updated_at ?? null,
      fields: platformCredentialFields(definition),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integration credentials GET]", err);
    return NextResponse.json({ error: "Could not load integration credentials" }, { status: 500 });
  }
}

/** PUT — save (upsert) encrypted platform-managed credentials. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { integrationId } = await params;
    const definition = getIntegration(integrationId);
    if (!definition || !requiresPlatformCredentials(definition)) {
      return NextResponse.json(
        { error: "This integration does not use platform-managed credentials" },
        { status: 404 },
      );
    }
    const body = await req.json() as { credentials?: unknown; displayHint?: unknown };
    const displayHint = typeof body.displayHint === "string" ? body.displayHint.trim().slice(0, 200) : null;
    const validated = validatePlatformCredentialInput(definition, body.credentials);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    await query(
      `INSERT INTO platform_integration_credentials
         (integration_id, auth_type, credentials_encrypted, display_hint, updated_by)
       VALUES ($1, $2, pgp_sym_encrypt($3, $4), $5, $6)
       ON CONFLICT (integration_id) DO UPDATE SET
         auth_type = EXCLUDED.auth_type,
         credentials_encrypted = EXCLUDED.credentials_encrypted,
         display_hint = EXCLUDED.display_hint,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [integrationId, definition.authType, JSON.stringify(validated.values), ENCRYPTION_KEY, displayHint, auth.user.id],
    );
    return NextResponse.json({ ok: true, configured: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integration credentials PUT]", err);
    return NextResponse.json({ error: "Could not save integration credentials" }, { status: 500 });
  }
}

/** DELETE — remove platform credentials. Disables the integration so it cannot
 *  stay enabled without configuration (keeps the configured/enable invariant). */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { integrationId } = await params;
    const definition = getIntegration(integrationId);
    if (!definition || !requiresPlatformCredentials(definition)) {
      return NextResponse.json(
        { error: "This integration does not use platform-managed credentials" },
        { status: 404 },
      );
    }
    const result = (await query<{integration_id:string}>(
      `DELETE FROM platform_integration_credentials
        WHERE integration_id = $1
        RETURNING integration_id`,
      [integrationId],
    ))[0];
    if (!result) return NextResponse.json({ error: "No credentials configured for this integration" }, { status: 404 });
    await query(
      `UPDATE platform_integrations
          SET enabled = FALSE, updated_at = now()
        WHERE integration_id = $1 AND enabled = TRUE`,
      [integrationId],
    );
    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integration credentials DELETE]", err);
    return NextResponse.json({ error: "Could not remove integration credentials" }, { status: 500 });
  }
}
