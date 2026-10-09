import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, withTransaction } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { getIntegration } from "@/modules/integrations/registry";
import { hashOAuthState } from "@/modules/integrations/oauth-state";

export const dynamic = "force-dynamic";

type OAuthStateRow = {
  integration_id: string;
  org_id: string;
  user_id: string;
  agent_id: string | null;
  redirect_uri: string;
  code_verifier: string | null;
};

function integrationReturnUrl(origin: string, orgId: string, status: string, integrationId: string): URL {
  const url = new URL(`/orgs/${encodeURIComponent(orgId)}/integrations`, origin);
  url.searchParams.set("oauth", status);
  url.searchParams.set("integrationId", integrationId);
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!state || state.length > 512) {
    return NextResponse.json({ error: "Invalid or expired OAuth state." }, { status: 400 });
  }

  try {
    await ensureMigrated();

    // Atomic one-time consume. Raw state is never queried or persisted.
    const consumed = await query<OAuthStateRow>(
      `UPDATE integration_oauth_states
          SET consumed_at = now()
        WHERE state_hash = $1
          AND consumed_at IS NULL
          AND expires_at > now()
        RETURNING integration_id, org_id, user_id, agent_id, redirect_uri,
          CASE WHEN code_verifier_encrypted IS NULL THEN NULL
               ELSE pgp_sym_decrypt(code_verifier_encrypted, $2)
          END AS code_verifier`,
      [hashOAuthState(state), ENCRYPTION_KEY],
    );
    const oauthState = consumed[0];
    if (!oauthState) {
      return NextResponse.json({ error: "Invalid, expired, or already-used OAuth state." }, { status: 400 });
    }

    const definition = getIntegration(oauthState.integration_id);
    if (!definition || definition.authType !== "oauth2" || !definition.oauth2Config) {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    const expectedRedirect = new URL(oauthState.redirect_uri);
    const actualCallback = request.nextUrl;
    if (expectedRedirect.origin !== actualCallback.origin || expectedRedirect.pathname !== actualCallback.pathname) {
      console.warn("[integration OAuth callback] callback origin/path did not match state-bound redirect URI");
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    const providerError = request.nextUrl.searchParams.get("error");
    const code = request.nextUrl.searchParams.get("code");
    if (providerError || !code || code.length > 4096) {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, providerError ? "cancelled" : "error", oauthState.integration_id));
    }

    const app = (await query<{
      client_id: string;
      client_secret: string;
      redirect_uri: string;
    }>(
      `SELECT client_id, pgp_sym_decrypt(client_secret_encrypted, $1) AS client_secret, redirect_uri
         FROM platform_integration_oauth_apps
        WHERE integration_id = $2`,
      [ENCRYPTION_KEY, oauthState.integration_id],
    ))[0];
    if (!app || app.redirect_uri !== oauthState.redirect_uri) {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    const tokenUrl = new URL(definition.oauth2Config.tokenUrl);
    if (tokenUrl.protocol !== "https:") {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: app.client_id,
      client_secret: app.client_secret,
      redirect_uri: app.redirect_uri,
    });
    if (definition.oauth2Config.pkce) {
      if (!oauthState.code_verifier) {
        return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
      }
      tokenBody.set("code_verifier", oauthState.code_verifier);
    }

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: tokenBody.toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }
    if (!tokenResponse.ok) {
      // Do not log provider response bodies: some providers echo sensitive values.
      console.warn("[integration OAuth callback] token exchange failed", {
        integrationId: oauthState.integration_id,
        status: tokenResponse.status,
      });
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    let tokenData: Record<string, unknown>;
    try {
      const parsed: unknown = await tokenResponse.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid token payload");
      tokenData = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : "";
    if (!accessToken) {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }
    const expiresIn = typeof tokenData.expires_in === "number" && Number.isFinite(tokenData.expires_in) && tokenData.expires_in > 0
      ? Math.min(Math.floor(tokenData.expires_in), 31_536_000)
      : 3600;
    const credentials = {
      access_token: accessToken,
      refresh_token: typeof tokenData.refresh_token === "string" ? tokenData.refresh_token : undefined,
      expires_in: expiresIn,
      claimed_at: Math.floor(Date.now() / 1000),
      token_url: tokenUrl.toString(),
      client_id: app.client_id,
      client_secret: app.client_secret,
      data: tokenData,
    };

    // Re-check the grant after the external provider round-trip; an admin may
    // have disabled this integration while the user was on the consent screen.
    const enabled = await query<{ enabled: boolean }>(
      `SELECT enabled FROM organisation_integrations
        WHERE org_id = $1 AND integration_id = $2`,
      [oauthState.org_id, oauthState.integration_id],
    );
    const platform = await query<{ enabled: boolean }>(
      "SELECT enabled FROM platform_integrations WHERE integration_id = $1",
      [oauthState.integration_id],
    );
    if (!enabled[0]?.enabled || !platform[0]?.enabled) {
      return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "error", oauthState.integration_id));
    }

    await withTransaction(async (client) => {
      const lockKey = [oauthState.org_id, oauthState.integration_id, oauthState.user_id, oauthState.agent_id ?? "org"].join(":");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      await client.query(
        `DELETE FROM integration_connections
          WHERE org_id = $1 AND integration_id = $2 AND user_id = $3
            AND agent_id IS NOT DISTINCT FROM $4::uuid`,
        [oauthState.org_id, oauthState.integration_id, oauthState.user_id, oauthState.agent_id],
      );
      await client.query(
        `INSERT INTO integration_connections
           (org_id, agent_id, user_id, integration_id, auth_type, credentials_encrypted, display_name, metadata)
         VALUES ($1, $2, $3, $4, 'oauth2', pgp_sym_encrypt($5, $6), $7, $8::jsonb)`,
        [
          oauthState.org_id,
          oauthState.agent_id,
          oauthState.user_id,
          oauthState.integration_id,
          JSON.stringify(credentials),
          ENCRYPTION_KEY,
          definition.displayName,
          JSON.stringify({ connectedAt: new Date().toISOString(), authFlow: "oauth2" }),
        ],
      );
    });

    return NextResponse.redirect(integrationReturnUrl(request.nextUrl.origin, oauthState.org_id, "connected", oauthState.integration_id));
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[integration OAuth callback] processing failed", error);
    return NextResponse.json({ error: "OAuth connection could not be completed." }, { status: 500 });
  }
}
