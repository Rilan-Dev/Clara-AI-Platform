import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAgentPermission, requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { getIntegration } from "@/modules/integrations/registry";
import { createOAuthState } from "@/modules/integrations/oauth-state";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; integrationId: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { orgId, integrationId } = await params;
    const auth = await requireAuth(request);
    await requireOrgPermission(auth, orgId, "config:update");

    const definition = getIntegration(integrationId);
    if (!definition || definition.authType !== "oauth2" || !definition.oauth2Config) {
      return NextResponse.json({ error: "OAuth2 integration is not supported." }, { status: 404 });
    }

    const agentIdParam = request.nextUrl.searchParams.get("agentId");
    const agentId = agentIdParam?.trim() || null;
    if (agentId) {
      const agentContext = await requireAgentPermission(auth, agentId, "config:update");
      if (agentContext.orgId !== orgId) {
        return NextResponse.json({ error: "Agent does not belong to this organisation." }, { status: 403 });
      }
    }

    const [platform, organisation, limits] = await Promise.all([
      query<{ enabled: boolean; allowed_plans: string[] }>(
        "SELECT enabled, allowed_plans FROM platform_integrations WHERE integration_id = $1",
        [integrationId],
      ),
      query<{ enabled: boolean }>(
        "SELECT enabled FROM organisation_integrations WHERE org_id = $1 AND integration_id = $2",
        [orgId, integrationId],
      ),
      resolveOrgPlanLimits(orgId),
    ]);
    if (!platform[0]?.enabled) {
      return NextResponse.json({ error: "Integration is disabled by the platform administrator." }, { status: 403 });
    }
    if (!organisation[0]?.enabled) {
      return NextResponse.json({ error: "Enable this integration for the organisation before connecting it." }, { status: 409 });
    }
    if (!Array.isArray(platform[0].allowed_plans) ||
        (!platform[0].allowed_plans.includes(limits.plan_id) && !platform[0].allowed_plans.includes("*"))) {
      return NextResponse.json({ error: "The organisation plan is not entitled to this integration." }, { status: 402 });
    }

    const app = (await query<{
      client_id: string;
      redirect_uri: string;
      scopes: string[];
    }>(
      `SELECT client_id, redirect_uri, scopes
         FROM platform_integration_oauth_apps
        WHERE integration_id = $1`,
      [integrationId],
    ))[0];
    if (!app) {
      return NextResponse.json({ error: "Platform OAuth application is not configured for this integration." }, { status: 409 });
    }

    const created = createOAuthState();
    const usePkce = definition.oauth2Config.pkce === true;
    await query(
      `INSERT INTO integration_oauth_states
         (state_hash, integration_id, org_id, user_id, agent_id, redirect_uri,
          code_verifier_encrypted, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6,
          CASE WHEN $7::text IS NULL THEN NULL ELSE pgp_sym_encrypt($7, $8) END,
          $9)`,
      [
        created.stateHash,
        integrationId,
        orgId,
        auth.user.id,
        agentId,
        app.redirect_uri,
        usePkce ? created.codeVerifier : null,
        ENCRYPTION_KEY,
        created.expiresAt,
      ],
    );

    const authorizationUrl = new URL(definition.oauth2Config.authUrl);
    for (const [key, value] of Object.entries(definition.oauth2Config.extraParams ?? {})) {
      if (!["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method"].includes(key)) {
        authorizationUrl.searchParams.set(key, value);
      }
    }
    authorizationUrl.searchParams.set("client_id", app.client_id);
    authorizationUrl.searchParams.set("redirect_uri", app.redirect_uri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", (Array.isArray(app.scopes) ? app.scopes : definition.oauth2Config.scopes).join(" "));
    authorizationUrl.searchParams.set("state", created.state);
    if (definition.oauth2Config.prompt && definition.oauth2Config.prompt !== "omit") {
      authorizationUrl.searchParams.set("prompt", definition.oauth2Config.prompt);
    }
    if (usePkce) {
      authorizationUrl.searchParams.set("code_challenge", created.codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
    }

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[org integration OAuth start]", error);
    return NextResponse.json({ error: "Could not start OAuth connection." }, { status: 500 });
  }
}
