import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { requireAgentPermission, requireAuth } from "@/modules/auth/core/rbac";

export const dynamic = "force-dynamic";

type OAuthState = { org_id: string; agent_id: string; user_id: string; redirect_uri: string };
type GraphPhone = { id?: string; display_phone_number?: string; verified_name?: string };
type GraphWaba = { id?: string; name?: string; phone_numbers?: { data?: GraphPhone[] } };
type GraphBusiness = { id?: string; name?: string; owned_whatsapp_business_accounts?: { data?: GraphWaba[] }; client_whatsapp_business_accounts?: { data?: GraphWaba[] } };
type Candidate = {
  businessId: string; businessName: string; wabaId: string; wabaName: string;
  phoneNumberId: string; displayPhoneNumber: string; verifiedName: string | null;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function parseExpiresIn(value: unknown): number | null {
  const seconds = typeof value === "number" ? value
    : typeof value === "string" && /^\\d+$/.test(value) ? Number(value) : null;
  return seconds !== null && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 2_147_483_647
    ? seconds : null;
}
function returnUrl(origin: string, orgId: string, agentId: string, status: string, sessionId?: string): NextResponse {
  const url = new URL(`/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agentId)}/messaging`, origin);
  url.searchParams.set("whatsapp", status);
  if (sessionId) url.searchParams.set("session", sessionId);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!state || state.length > 512) return NextResponse.json({ error: "Invalid WhatsApp OAuth state." }, { status: 400 });
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const stateHash = digest(state);
    const pending = (await query<OAuthState>(
      `SELECT org_id, agent_id, user_id, redirect_uri FROM whatsapp_oauth_states
        WHERE state_hash = $1 AND user_id = $2 AND consumed_at IS NULL AND expires_at > now()
        LIMIT 1`,
      [stateHash, auth.user.id],
    ))[0];
    if (!pending) return NextResponse.json({ error: "Invalid, expired, or already-used WhatsApp OAuth state." }, { status: 400 });
    const access = await requireAgentPermission(auth, pending.agent_id, "config:update");
    if (access.orgId !== pending.org_id) return NextResponse.json({ error: "Agent does not belong to the initiating organisation." }, { status: 403 });
    // Consume only after revalidating the initiating user's current agent permission.
    const consumed = await query<OAuthState>(
      `UPDATE whatsapp_oauth_states SET consumed_at = now()
        WHERE state_hash = $1 AND user_id = $2 AND consumed_at IS NULL AND expires_at > now()
        RETURNING org_id, agent_id, user_id, redirect_uri`,
      [stateHash, auth.user.id],
    );
    const oauthState = consumed[0];
    if (!oauthState) return NextResponse.json({ error: "Invalid, expired, or already-used WhatsApp OAuth state." }, { status: 400 });
    const origin = new URL(oauthState.redirect_uri).origin;
    const callback = new URL(oauthState.redirect_uri);
    if (callback.origin !== req.nextUrl.origin || callback.pathname !== req.nextUrl.pathname) {
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    }
    if (req.nextUrl.searchParams.has("error") || !code || code.length > 4096) {
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "cancelled");
    }
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret || ENCRYPTION_KEY.length < 32) {
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "configuration-error");
    }

    const tokenUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", oauthState.redirect_uri);
    tokenUrl.searchParams.set("code", code);
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(12_000) });
    } catch {
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    }
    if (!tokenResponse.ok) {
      console.warn("[whatsapp OAuth callback] token exchange failed", { status: tokenResponse.status });
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    }
    const tokenJson: unknown = await tokenResponse.json().catch(() => null);
    const initialAccessToken = tokenJson && typeof tokenJson === "object" && "access_token" in tokenJson &&
      typeof (tokenJson as { access_token?: unknown }).access_token === "string"
      ? (tokenJson as { access_token: string }).access_token : "";
    if (!initialAccessToken || initialAccessToken.length > 8192) return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    const initialExpiresIn = tokenJson && typeof tokenJson === "object" && "expires_in" in tokenJson
      ? (tokenJson as { expires_in?: unknown }).expires_in : undefined;

    // Prefer a long-lived token, but retain the code-exchanged token with its known expiry if the optional exchange is unavailable.
    let accessToken = initialAccessToken;
    let tokenExpiresIn = parseExpiresIn(initialExpiresIn);
    const exchangeUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
    exchangeUrl.searchParams.set("client_id", appId);
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("fb_exchange_token", initialAccessToken);
    try {
      const exchangeResponse = await fetch(exchangeUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(12_000) });
      if (exchangeResponse.ok) {
        const exchangeJson: unknown = await exchangeResponse.json().catch(() => null);
        const exchangedToken = exchangeJson && typeof exchangeJson === "object" && "access_token" in exchangeJson &&
          typeof (exchangeJson as { access_token?: unknown }).access_token === "string"
          ? (exchangeJson as { access_token: string }).access_token : "";
        if (exchangedToken && exchangedToken.length <= 8192) {
          accessToken = exchangedToken;
          const expiresInValue = exchangeJson && typeof exchangeJson === "object" && "expires_in" in exchangeJson
            ? (exchangeJson as { expires_in?: unknown }).expires_in : undefined;
          tokenExpiresIn = parseExpiresIn(expiresInValue);
        } else {
          console.warn("[whatsapp OAuth callback] long-lived token response omitted an access token; retaining initial token");
        }
      } else {
        console.warn("[whatsapp OAuth callback] long-lived token exchange unavailable; retaining initial token", { status: exchangeResponse.status });
      }
    } catch {
      console.warn("[whatsapp OAuth callback] long-lived token exchange timed out; retaining initial token");
    }
    if (!accessToken || accessToken.length > 8192) return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");

    const graphUrl = new URL("https://graph.facebook.com/v23.0/me/businesses");
    graphUrl.searchParams.set("fields", "id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}");
    graphUrl.searchParams.set("limit", "100");
    let graphResponse: Response;
    try {
      graphResponse = await fetch(graphUrl, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` }, redirect: "manual", signal: AbortSignal.timeout(12_000) });
    } catch {
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    }
    if (!graphResponse.ok) {
      console.warn("[whatsapp OAuth callback] business discovery failed", { status: graphResponse.status });
      return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    }
    const graphJson: unknown = await graphResponse.json().catch(() => null);
    const businesses = graphJson && typeof graphJson === "object" && "data" in graphJson && Array.isArray((graphJson as { data?: unknown }).data)
      ? (graphJson as { data: GraphBusiness[] }).data : [];
    const candidates: Candidate[] = [];
    for (const business of businesses) {
      const accounts = [
        ...(business.owned_whatsapp_business_accounts?.data ?? []),
        ...(business.client_whatsapp_business_accounts?.data ?? []),
      ];
      for (const waba of accounts) {
        for (const phone of waba.phone_numbers?.data ?? []) {
          if (!business.id || !waba.id || !phone.id || !phone.display_phone_number) continue;
          candidates.push({
            businessId: business.id, businessName: business.name ?? business.id,
            wabaId: waba.id, wabaName: waba.name ?? waba.id, phoneNumberId: phone.id,
            displayPhoneNumber: phone.display_phone_number, verifiedName: phone.verified_name ?? null,
          });
        }
      }
    }
    if (candidates.length === 0) return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "no-eligible-phone");
    // Access tokens are encrypted immediately. Only provider IDs and display labels are exposed to the authenticated owner.
    const session = (await query<{ id: string }>(
      `INSERT INTO whatsapp_oauth_sessions
         (state_hash, org_id, agent_id, user_id, access_token_encrypted, access_token_expires_at, candidates, expires_at)
       VALUES($1, $2, $3, $4, pgp_sym_encrypt($5, $6),
              CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7::int * interval '1 second') END,
              $8::jsonb, now() + interval '10 minutes')
       RETURNING id`,
      [digest(state), oauthState.org_id, oauthState.agent_id, oauthState.user_id, accessToken, ENCRYPTION_KEY, tokenExpiresIn, JSON.stringify(candidates)],
    ))[0];
    if (!session) return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "error");
    return returnUrl(origin, oauthState.org_id, oauthState.agent_id, "select-phone", session.id);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[whatsapp OAuth callback]", err);
    return NextResponse.json({ error: "WhatsApp authorization could not be completed." }, { status: 500 });
  }
}
