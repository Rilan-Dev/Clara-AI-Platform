import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { requireAgentPermission, requireAuth } from "@/modules/auth/core/rbac";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orgId: string; agentId: string }> };
type Candidate = {
  businessId: string;
  businessName: string;
  wabaId: string;
  wabaName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}


async function subscribeWaba(wabaId: string, token: string): Promise<boolean> {
  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(wabaId)}/subscribed_apps`);
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return false;
    const result: unknown = await response.json().catch(() => null);
    return Boolean(result && typeof result === "object" && "success" in result && (result as { success?: unknown }).success === true);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "project:read");
    if (access.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });

    const connection = (await query<{
      id: string; waba_id: string; waba_name: string | null; phone_number_id: string;
      display_phone_number: string; verified_name: string | null; status: string;
      webhook_verified: boolean; webhook_verified_at: string | null; last_webhook_at: string | null;
      last_error_code: string | null; daily_briefing_enabled: boolean; updated_at: string;
    }>(`SELECT id, waba_id, waba_name, phone_number_id, display_phone_number, verified_name,
              status, webhook_verified, webhook_verified_at, last_webhook_at, last_error_code, daily_briefing_enabled, updated_at
         FROM whatsapp_business_connections WHERE org_id = $1 AND agent_id = $2 AND status = 'active'
         ORDER BY updated_at DESC LIMIT 1`, [orgId, agentId]))[0] ?? null;

    const sessionId = req.nextUrl.searchParams.get("session");
    let pending: { id: string; candidates: Candidate[] } | null = null;
    if (sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)) {
      const row = (await query<{ id: string; candidates: Candidate[] }>(
        `SELECT id, candidates FROM whatsapp_oauth_sessions
          WHERE id = $1 AND org_id = $2 AND agent_id = $3 AND user_id = $4
            AND selected_at IS NULL AND expires_at > now()`,
        [sessionId, orgId, agentId, auth.user.id],
      ))[0];
      if (row) pending = row;
    }
    const ready = Boolean(connection && connection.status === "active" && connection.webhook_verified);
    return NextResponse.json({
      connection: connection ? {
        id: connection.id, wabaId: connection.waba_id, wabaName: connection.waba_name,
        phoneNumberId: connection.phone_number_id, displayPhoneNumber: connection.display_phone_number,
        verifiedName: connection.verified_name, status: connection.status,
        webhookVerified: connection.webhook_verified, webhookVerifiedAt: connection.webhook_verified_at,
        lastWebhookAt: connection.last_webhook_at, lastErrorCode: connection.last_error_code,
        updatedAt: connection.updated_at,
      } : null,
      webhook: { verified: connection?.webhook_verified ?? false, lastEventAt: connection?.last_webhook_at ?? null },
      dailyBriefing: { enabled: Boolean(ready && connection?.daily_briefing_enabled), ready, reason: ready ? null : "Connect a WhatsApp Business phone and verify webhook delivery first." },
      pendingSelection: pending,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[whatsapp connection GET]", err);
    return NextResponse.json({ error: "Failed to load WhatsApp connection status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "config:update");
    if (access.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });
    const body = await req.json().catch(() => ({})) as { action?: string; sessionId?: string; phoneNumberId?: string };
    if (body.action === "connect") {
      const appId = process.env.META_APP_ID?.trim();
      const callbackOrigin = resolvePublicOrigin(req);
      const redirectUri = `${callbackOrigin}/api/whatsapp/oauth/callback`;
      if (!appId || !process.env.META_APP_SECRET?.trim() || ENCRYPTION_KEY.length < 32) {
        return NextResponse.json({ error: "Meta WhatsApp OAuth is not configured on the server." }, { status: 503 });
      }
      const state = randomBytes(32).toString("base64url");
      await query(
        `INSERT INTO whatsapp_oauth_states(state_hash, org_id, agent_id, user_id, redirect_uri, expires_at)
         VALUES($1, $2, $3, $4, $5, now() + interval '10 minutes')`,
        [digest(state), orgId, agentId, auth.user.id, redirectUri],
      );
      const authorize = new URL("https://www.facebook.com/v23.0/dialog/oauth");
      authorize.searchParams.set("client_id", appId);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("state", state);
      authorize.searchParams.set("scope", "business_management,whatsapp_business_management,whatsapp_business_messaging");
      return NextResponse.json({ authorizationUrl: authorize.toString() });
    }

    if (body.action === "select-phone") {
      if (!body.sessionId || !/^[0-9a-f-]{36}$/i.test(body.sessionId) || !body.phoneNumberId) {
        return NextResponse.json({ error: "A valid OAuth session and phone number are required." }, { status: 400 });
      }
      const inserted = await query<{ id: string }>(
        `WITH candidate AS (
           SELECT s.id AS session_id, s.org_id, s.agent_id, s.user_id,
                  pgp_sym_decrypt(s.access_token_encrypted, $1) AS access_token,
                  c->>'wabaId' AS waba_id, c->>'wabaName' AS waba_name,
                  c->>'phoneNumberId' AS phone_number_id,
                  c->>'displayPhoneNumber' AS display_phone_number,
                  NULLIF(c->>'verifiedName','') AS verified_name
             FROM whatsapp_oauth_sessions s
             CROSS JOIN LATERAL jsonb_array_elements(s.candidates) c
            WHERE s.id = $2 AND s.org_id = $3 AND s.agent_id = $4 AND s.user_id = $5
              AND s.selected_at IS NULL AND s.expires_at > now()
              AND c->>'phoneNumberId' = $6
            FOR UPDATE OF s
         )
         INSERT INTO whatsapp_business_connections
           (org_id, agent_id, user_id, waba_id, waba_name, phone_number_id,
            display_phone_number, verified_name, access_token_encrypted, status, webhook_verified)
         SELECT org_id, agent_id, user_id, waba_id, waba_name, phone_number_id,
                display_phone_number, verified_name, pgp_sym_encrypt(access_token, $1), 'active', false
           FROM candidate
         RETURNING id`,
        [ENCRYPTION_KEY, body.sessionId, orgId, agentId, auth.user.id, body.phoneNumberId],
      );
      if (!inserted[0]) return NextResponse.json({ error: "The selection expired or the phone is not part of this authorization." }, { status: 400 });
      await query("UPDATE whatsapp_oauth_sessions SET selected_at = now() WHERE id = $1 AND user_id = $2", [body.sessionId, auth.user.id]);
      const selected = (await query<{ waba_id: string; access_token: string }>(
        `SELECT waba_id, pgp_sym_decrypt(access_token_encrypted, $3) AS access_token
           FROM whatsapp_business_connections WHERE id = $1 AND org_id = $2`,
        [inserted[0].id, orgId, ENCRYPTION_KEY],
      ))[0];
      const subscribed = selected ? await subscribeWaba(selected.waba_id, selected.access_token) : false;
      await query(
        `UPDATE whatsapp_business_connections SET last_error_code = $2, updated_at = now() WHERE id = $1`,
        [inserted[0].id, subscribed ? null : "WEBHOOK_SUBSCRIBE_FAILED"],
      );
      return NextResponse.json({
        ok: true, connectionId: inserted[0].id, webhookSubscribed: subscribed,
        webhookVerified: false, dailyBriefingReady: false,
        ...(subscribed ? {} : { warning: "Phone saved, but Meta webhook subscription failed. Retry subscription before expecting inbound messages." }),
      });
    }

    if (body.action === "enable-briefing") {
      const enabled = await query<{ id: string }>(
        `UPDATE whatsapp_business_connections
            SET daily_briefing_enabled = true, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active' AND webhook_verified = true
          RETURNING id`,
        [orgId, agentId],
      );
      if (!enabled[0]) return NextResponse.json({ error: "Daily briefings require an active phone and a verified webhook." }, { status: 409 });
      return NextResponse.json({ ok: true, enabled: true });
    }

    if (body.action === "disable-briefing") {
      await query(
        `UPDATE whatsapp_business_connections SET daily_briefing_enabled = false, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2`,
        [orgId, agentId],
      );
      return NextResponse.json({ ok: true, enabled: false });
    }

    if (body.action === "subscribe") {
      const connection = (await query<{ id: string; waba_id: string; access_token: string }>(
        `SELECT id, waba_id, pgp_sym_decrypt(access_token_encrypted, $3) AS access_token
           FROM whatsapp_business_connections
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active' LIMIT 1`,
        [orgId, agentId, ENCRYPTION_KEY],
      ))[0];
      if (!connection) return NextResponse.json({ error: "No active WhatsApp phone is connected." }, { status: 404 });
      const subscribed = await subscribeWaba(connection.waba_id, connection.access_token);
      await query(
        `UPDATE whatsapp_business_connections SET last_error_code = $2, updated_at = now() WHERE id = $1`,
        [connection.id, subscribed ? null : "WEBHOOK_SUBSCRIBE_FAILED"],
      );
      return NextResponse.json({ ok: subscribed, webhookSubscribed: subscribed }, { status: subscribed ? 200 : 502 });
    }

    if (body.action === "disconnect") {
      const result = await query(
        `UPDATE whatsapp_business_connections SET status = 'disconnected', daily_briefing_enabled = false, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active'`,
        [orgId, agentId],
      );
      return NextResponse.json({ ok: true, disconnected: result.length > 0 });
    }
    return NextResponse.json({ error: "Unsupported WhatsApp connection action." }, { status: 400 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = String(err);
    if (message.includes("whatsapp_one_active_phone_per_agent_idx") || message.includes("whatsapp_one_active_owner_per_phone_idx") || message.includes("duplicate key")) {
      return NextResponse.json({ error: "This agent already has an active WhatsApp phone, or the selected phone is connected to another agent." }, { status: 409 });
    }
    console.error("[whatsapp connection POST]", err);
    return NextResponse.json({ error: "Failed to update WhatsApp connection" }, { status: 500 });
  }
}
