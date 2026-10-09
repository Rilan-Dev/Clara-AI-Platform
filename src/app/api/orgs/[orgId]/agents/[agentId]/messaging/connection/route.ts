import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { requireAgentPermission, requireAuth } from "@/modules/auth/core/rbac";
import { isValidE164Phone } from "@/modules/integrations/whatsapp-briefing";

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


async function verifyWabaAccess(wabaId: string, token: string): Promise<"ok" | "rejected" | "unavailable"> {
  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(wabaId)}`);
    url.searchParams.set("fields", "id");
    const response = await fetch(url, {
      method: "GET", headers: { Authorization: `Bearer ${token}` },
      redirect: "manual", signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) return "rejected";
    if (!response.ok) return "unavailable";
    const data: unknown = await response.json().catch(() => null);
    return data && typeof data === "object" && "id" in data && (data as { id?: unknown }).id === wabaId
      ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function subscribeWaba(wabaId: string, token: string): Promise<{ ok: boolean; authRejected: boolean }> {
  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(wabaId)}/subscribed_apps`);
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }).toString(),
      redirect: "manual", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, authRejected: response.status === 401 || response.status === 403 };
    const result: unknown = await response.json().catch(() => null);
    return { ok: Boolean(result && typeof result === "object" && "success" in result && (result as { success?: unknown }).success === true), authRejected: false };
  } catch {
    return { ok: false, authRejected: false };
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { orgId, agentId } = await params;
    const auth = await requireAuth(req);
    const access = await requireAgentPermission(auth, agentId, "project:read");
    if (access.orgId !== orgId) return NextResponse.json({ error: "Agent does not belong to organisation" }, { status: 403 });

    await query(
      `UPDATE whatsapp_business_connections
          SET status = 'error', daily_briefing_enabled = false, last_error_code = 'TOKEN_EXPIRED', updated_at = now()
        WHERE org_id = $1 AND agent_id = $2 AND status = 'active'
          AND access_token_expires_at IS NOT NULL AND access_token_expires_at <= now()`,
      [orgId, agentId],
    );

    const latestConnection = (await query<{
      id: string; waba_id: string; waba_name: string | null; phone_number_id: string;
      display_phone_number: string; verified_name: string | null; status: string;
      webhook_verified: boolean; webhook_verified_at: string | null; last_webhook_at: string | null;
      last_error_code: string | null; access_token_expires_at: string | null; daily_briefing_enabled: boolean; briefing_recipient_phone: string | null; briefing_recipient_opt_in_at: string | null; daily_briefing_last_sent_on: string | null; updated_at: string;
    }>(`SELECT id, waba_id, waba_name, phone_number_id, display_phone_number, verified_name,
              status, webhook_verified, webhook_verified_at, last_webhook_at, last_error_code, access_token_expires_at, daily_briefing_enabled, briefing_recipient_phone, briefing_recipient_opt_in_at, daily_briefing_last_sent_on, updated_at
         FROM whatsapp_business_connections WHERE org_id = $1 AND agent_id = $2
         ORDER BY updated_at DESC LIMIT 1`, [orgId, agentId]))[0] ?? null;
    const connection = latestConnection?.status === "disconnected" ? null : latestConnection;

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
    const connectionReady = Boolean(connection && connection.status === "active" && connection.webhook_verified && (!connection.access_token_expires_at || new Date(connection.access_token_expires_at).getTime() > Date.now()));
    const ready = Boolean(connectionReady && connection?.briefing_recipient_phone && connection?.briefing_recipient_opt_in_at);
    return NextResponse.json({
      connection: connection ? {
        id: connection.id, wabaId: connection.waba_id, wabaName: connection.waba_name,
        phoneNumberId: connection.phone_number_id, displayPhoneNumber: connection.display_phone_number,
        verifiedName: connection.verified_name, status: connection.status,
        webhookVerified: connection.webhook_verified, webhookVerifiedAt: connection.webhook_verified_at,
        lastWebhookAt: connection.last_webhook_at, lastErrorCode: connection.last_error_code,
        accessTokenExpiresAt: connection.access_token_expires_at,
        briefingRecipientPhone: connection.briefing_recipient_phone,
        briefingRecipientOptInAt: connection.briefing_recipient_opt_in_at,
        dailyBriefingLastSentOn: connection.daily_briefing_last_sent_on,
        updatedAt: connection.updated_at,
      } : null,
      webhook: { verified: connection?.webhook_verified ?? false, lastEventAt: connection?.last_webhook_at ?? null },
      dailyBriefing: {
        enabled: Boolean(ready && connection?.daily_briefing_enabled),
        ready,
        reason: !connectionReady ? "Connect a WhatsApp Business phone and verify webhook delivery first."
          : !connection?.briefing_recipient_phone || !connection?.briefing_recipient_opt_in_at
            ? "Add an opted-in recipient before enabling daily briefings."
            : null,
      },
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
    await query(
      `UPDATE whatsapp_business_connections
          SET status = 'error', daily_briefing_enabled = false, last_error_code = 'TOKEN_EXPIRED', updated_at = now()
        WHERE org_id = $1 AND agent_id = $2 AND status = 'active'
          AND access_token_expires_at IS NOT NULL AND access_token_expires_at <= now()`,
      [orgId, agentId],
    );
    const body = await req.json().catch(() => ({})) as { action?: string; sessionId?: string; phoneNumberId?: string; recipientPhone?: string; optIn?: boolean };
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
                  pgp_sym_decrypt(s.access_token_encrypted, $1) AS access_token, s.access_token_expires_at,
                  c->>'wabaId' AS waba_id, c->>'wabaName' AS waba_name,
                  c->>'phoneNumberId' AS phone_number_id,
                  c->>'displayPhoneNumber' AS display_phone_number,
                  NULLIF(c->>'verifiedName','') AS verified_name
             FROM whatsapp_oauth_sessions s
             CROSS JOIN LATERAL jsonb_array_elements(s.candidates) c
            WHERE s.id = $2 AND s.org_id = $3 AND s.agent_id = $4 AND s.user_id = $5
              AND s.selected_at IS NULL AND s.expires_at > now()
              AND c->>'phoneNumberId' = $6
              AND (s.access_token_expires_at IS NULL OR s.access_token_expires_at > now())
            FOR UPDATE OF s
         )
         INSERT INTO whatsapp_business_connections
           (org_id, agent_id, user_id, waba_id, waba_name, phone_number_id,
            display_phone_number, verified_name, access_token_encrypted, access_token_expires_at, status, webhook_verified)
         SELECT org_id, agent_id, user_id, waba_id, waba_name, phone_number_id,
                display_phone_number, verified_name, pgp_sym_encrypt(access_token, $1), access_token_expires_at, 'active', false
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
      const subscription = selected ? await subscribeWaba(selected.waba_id, selected.access_token) : { ok: false, authRejected: false };
      await query(
        `UPDATE whatsapp_business_connections
            SET status = CASE WHEN $3 THEN 'error' ELSE status END,
                daily_briefing_enabled = CASE WHEN $3 THEN false ELSE daily_briefing_enabled END,
                last_error_code = $2, updated_at = now()
          WHERE id = $1`,
        [inserted[0].id, subscription.ok ? null : subscription.authRejected ? "META_AUTH_OR_PERMISSION_REJECTED" : "WEBHOOK_SUBSCRIBE_FAILED", subscription.authRejected],
      );
      const subscribed = subscription.ok;
      return NextResponse.json({
        ok: true, connectionId: inserted[0].id, webhookSubscribed: subscribed,
        webhookVerified: false, dailyBriefingReady: false,
        ...(subscribed ? {} : { warning: "Phone saved, but Meta webhook subscription failed. Retry subscription before expecting inbound messages." }),
      });
    }

    if (body.action === "save-briefing-recipient") {
      const phone = body.recipientPhone?.trim() ?? "";
      if (!isValidE164Phone(phone) || body.optIn !== true) {
        return NextResponse.json({ error: "Enter a valid E.164 phone number and confirm the recipient's opt-in." }, { status: 400 });
      }
      const saved = await query<{ id: string }>(
        `UPDATE whatsapp_business_connections
            SET briefing_recipient_phone = $3, briefing_recipient_opt_in_at = now(),
                daily_briefing_enabled = false, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active' AND webhook_verified = true
            AND (access_token_expires_at IS NULL OR access_token_expires_at > now())
          RETURNING id`,
        [orgId, agentId, phone],
      );
      if (!saved[0]) return NextResponse.json({ error: "Save the briefing recipient only after the WhatsApp connection and webhook are verified." }, { status: 409 });
      return NextResponse.json({ ok: true, recipientPhone: phone, optedIn: true });
    }

    if (body.action === "clear-briefing-recipient") {
      await query(
        `UPDATE whatsapp_business_connections
            SET briefing_recipient_phone = NULL, briefing_recipient_opt_in_at = NULL,
                daily_briefing_enabled = false, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2`,
        [orgId, agentId],
      );
      return NextResponse.json({ ok: true, consentCleared: true });
    }

    if (body.action === "enable-briefing") {
      const enabled = await query<{ id: string }>(
        `UPDATE whatsapp_business_connections
            SET daily_briefing_enabled = true, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active' AND webhook_verified = true
            AND briefing_recipient_phone IS NOT NULL AND briefing_recipient_opt_in_at IS NOT NULL
            AND (access_token_expires_at IS NULL OR access_token_expires_at > now())
          RETURNING id`,
        [orgId, agentId],
      );
      if (!enabled[0]) return NextResponse.json({ error: "Daily briefings require an active verified phone and an opted-in recipient." }, { status: 409 });
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
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active'
            AND (access_token_expires_at IS NULL OR access_token_expires_at > now()) LIMIT 1`,
        [orgId, agentId, ENCRYPTION_KEY],
      ))[0];
      if (!connection) return NextResponse.json({ error: "No active WhatsApp phone is connected." }, { status: 404 });
      const subscription = await subscribeWaba(connection.waba_id, connection.access_token);
      await query(
        `UPDATE whatsapp_business_connections
            SET status = CASE WHEN $3 THEN 'error' ELSE status END,
                daily_briefing_enabled = CASE WHEN $3 THEN false ELSE daily_briefing_enabled END,
                last_error_code = $2, updated_at = now()
          WHERE id = $1`,
        [connection.id, subscription.ok ? null : subscription.authRejected ? "META_AUTH_OR_PERMISSION_REJECTED" : "WEBHOOK_SUBSCRIBE_FAILED", subscription.authRejected],
      );
      return NextResponse.json({ ok: subscription.ok, webhookSubscribed: subscription.ok }, { status: subscription.ok ? 200 : 502 });
    }

    if (body.action === "verify") {
      const connection = (await query<{ id: string; waba_id: string; access_token: string }>(
        `SELECT id, waba_id, pgp_sym_decrypt(access_token_encrypted, $3) AS access_token
           FROM whatsapp_business_connections
          WHERE org_id = $1 AND agent_id = $2 AND status = 'active'
            AND (access_token_expires_at IS NULL OR access_token_expires_at > now())
          LIMIT 1`,
        [orgId, agentId, ENCRYPTION_KEY],
      ))[0];
      if (!connection) return NextResponse.json({ error: "No active, non-expired WhatsApp connection is available to verify." }, { status: 404 });
      const verification = await verifyWabaAccess(connection.waba_id, connection.access_token);
      if (verification === "rejected") {
        await query(
          `UPDATE whatsapp_business_connections
              SET status = 'error', daily_briefing_enabled = false,
                  last_error_code = 'META_AUTH_OR_PERMISSION_REJECTED', updated_at = now()
            WHERE id = $1`,
          [connection.id],
        );
        return NextResponse.json({ error: "Meta rejected this connection token or its WABA permissions. Reconnect the business account." }, { status: 409 });
      }
      if (verification !== "ok") return NextResponse.json({ error: "Meta connection health could not be confirmed; try again." }, { status: 502 });
      await query(
        `UPDATE whatsapp_business_connections SET updated_at = now()
          WHERE id = $1 AND status = 'active'`,
        [connection.id],
      );
      return NextResponse.json({ ok: true, verified: true });
    }

    if (body.action === "disconnect") {
      const result = await query(
        `UPDATE whatsapp_business_connections SET status = 'disconnected', daily_briefing_enabled = false, updated_at = now()
          WHERE org_id = $1 AND agent_id = $2 AND status IN ('active','error','revoked')
          RETURNING id`,
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
