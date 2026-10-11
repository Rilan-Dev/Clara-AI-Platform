import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getIntegration } from "@/modules/integrations/registry";
import { normalizeScopes, validateRedirectUri } from "@/modules/integrations/oauth-app-validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ integrationId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { integrationId } = await params;
    const definition = getIntegration(integrationId);
    if (!definition || definition.authType !== "oauth2") {
      return NextResponse.json({ error: "OAuth2 integration not found" }, { status: 404 });
    }
    const row = (await query<{
      client_id: string;
      redirect_uri: string;
      scopes: string[];
      updated_at: Date;
    }>(
      `SELECT client_id, redirect_uri, scopes, updated_at
         FROM platform_integration_oauth_apps
        WHERE integration_id = $1`,
      [integrationId],
    ))[0];
    return NextResponse.json({
      integrationId,
      configured: Boolean(row),
      credentialSource: row ? "database" : "unconfigured",
      secretConfigured: Boolean(row),
      clientId: row?.client_id ?? "",
      redirectUri: row?.redirect_uri ?? "",
      scopes: Array.isArray(row?.scopes) ? row.scopes : definition.oauth2Config?.scopes ?? [],
      updatedAt: row?.updated_at ?? null,
      // Never select or return the encrypted client secret.
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integration OAuth GET]", err);
    return NextResponse.json({ error: "Could not load OAuth application configuration" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { integrationId } = await params;
    const definition = getIntegration(integrationId);
    if (!definition || definition.authType !== "oauth2") {
      return NextResponse.json({ error: "OAuth2 integration not found" }, { status: 404 });
    }
    const body = await req.json() as {
      clientId?: unknown;
      clientSecret?: unknown;
      redirectUri?: unknown;
      scopes?: unknown;
    };
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : "";
    const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";
    const scopes = normalizeScopes(body.scopes);
    if (!clientId || clientId.length > 512 || !redirectUri || scopes === null) {
      return NextResponse.json({ error: "A valid client ID, redirect URI, and scopes array are required" }, { status: 400 });
    }
    if (clientSecret.length > 8192) {
      return NextResponse.json({ error: "OAuth client secret is too long" }, { status: 400 });
    }
    const redirectError = validateRedirectUri(redirectUri);
    if (redirectError) {
      return NextResponse.json({ error: redirectError }, { status: 400 });
    }
    let secretToStore = clientSecret;
    if (!secretToStore) {
      // Blank secret means retain the current secret; never clear it accidentally
      // when the browser intentionally does not receive secret material.
      const existing = (await query<{ present: boolean }>(
        `SELECT TRUE AS present FROM platform_integration_oauth_apps WHERE integration_id = $1`,
        [integrationId],
      ))[0];
      if (!existing?.present) {
        return NextResponse.json({ error: "OAuth client secret is required for first-time setup" }, { status: 400 });
      }
      await query(
        `UPDATE platform_integration_oauth_apps
            SET client_id = $1, redirect_uri = $2, scopes = $3::jsonb,
                updated_by = $4, updated_at = now()
          WHERE integration_id = $5`,
        [clientId, redirectUri, JSON.stringify(scopes), auth.user.id, integrationId],
      );
      return NextResponse.json({ ok: true, configured: true });
    }
    await query(
      `INSERT INTO platform_integration_oauth_apps
         (integration_id, client_id, client_secret_encrypted, redirect_uri, scopes, updated_by)
       VALUES ($1, $2, pgp_sym_encrypt($3, $4), $5, $6::jsonb, $7)
       ON CONFLICT (integration_id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         client_secret_encrypted = EXCLUDED.client_secret_encrypted,
         redirect_uri = EXCLUDED.redirect_uri,
         scopes = EXCLUDED.scopes,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [integrationId, clientId, secretToStore, ENCRYPTION_KEY, redirectUri, JSON.stringify(scopes), auth.user.id],
    );
    return NextResponse.json({ ok: true, configured: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[platform integration OAuth PUT]", err);
    return NextResponse.json({ error: "Could not save OAuth application configuration" }, { status: 500 });
  }
}
