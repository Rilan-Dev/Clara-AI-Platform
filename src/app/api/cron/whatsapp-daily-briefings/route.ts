import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, withTransaction } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { buildWhatsAppDailySummary, getWhatsAppMetaSendErrorCode } from "@/modules/integrations/whatsapp-briefing";
import { advanceWhatsAppMessageStatus } from "@/modules/integrations/whatsapp-message-status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type BriefingConnection = {
  id: string;
  org_id: string;
  agent_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string;
  access_token: string;
  recipient_phone: string;
};

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ENCRYPTION_KEY.length < 32) return NextResponse.json({ error: "WhatsApp encryption is not configured" }, { status: 503 });
  const templateName = process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME?.trim() ?? "";
  const templateLanguage = process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_LANGUAGE?.trim() || "en_US";
  if (!/^[a-z0-9_]{1,512}$/.test(templateName) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(templateLanguage)) {
    return NextResponse.json({ error: "An approved WhatsApp daily-briefing template and language must be configured" }, { status: 503 });
  }

  try {
    await ensureMigrated();
    await query(
      `UPDATE whatsapp_business_connections
          SET status = 'error', daily_briefing_enabled = false, last_error_code = 'TOKEN_EXPIRED', updated_at = now()
        WHERE status = 'active' AND access_token_expires_at IS NOT NULL AND access_token_expires_at <= now()`,
      [],
    );
    const briefingDate = new Date().toISOString().slice(0, 10);
    const connections = await query<BriefingConnection>(
      `SELECT c.id, c.org_id, c.agent_id, c.waba_id, c.phone_number_id, c.display_phone_number,
              pgp_sym_decrypt(c.access_token_encrypted, $1) AS access_token,
              c.briefing_recipient_phone AS recipient_phone
         FROM whatsapp_business_connections c
        WHERE c.status = 'active' AND c.webhook_verified = true AND c.daily_briefing_enabled = true
          AND c.briefing_recipient_phone IS NOT NULL AND c.briefing_recipient_opt_in_at IS NOT NULL
          AND (c.access_token_expires_at IS NULL OR c.access_token_expires_at > now())
          AND (c.daily_briefing_last_sent_on IS NULL OR c.daily_briefing_last_sent_on < $2::date)
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_daily_briefing_runs r
             WHERE r.connection_id = c.id AND r.briefing_date = $2::date
               AND r.status IN ('sending','sent')
          )
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_daily_briefing_runs r
             WHERE r.connection_id = c.id AND r.briefing_date = $2::date
               AND r.status = 'failed' AND r.attempt_count >= 3
          )
        ORDER BY c.daily_briefing_last_sent_on ASC NULLS FIRST, c.created_at ASC
        LIMIT 3`,
      [ENCRYPTION_KEY, briefingDate],
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const connection of connections) {
      const [messages, countRows] = await Promise.all([
        query<{ from_phone: string | null; body: string | null; message_type: string }>(
          `SELECT from_phone, body, message_type FROM whatsapp_messages
            WHERE connection_id = $1 AND direction = 'inbound' AND created_at >= now() - interval '24 hours'
            ORDER BY created_at DESC LIMIT 30`,
          [connection.id],
        ),
        query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM whatsapp_messages
            WHERE connection_id = $1 AND direction = 'inbound' AND created_at >= now() - interval '24 hours'`,
          [connection.id],
        ),
      ]);
      const summary = buildWhatsAppDailySummary(briefingDate, messages, countRows[0]?.total ?? messages.length);
      const run = (await query<{ id: string }>(
        `INSERT INTO whatsapp_daily_briefing_runs
           (connection_id, briefing_date, recipient_phone, status, summary_text, attempt_count, started_at, updated_at)
         VALUES($1, $2::date, $3, 'sending', $4, 1, now(), now())
         ON CONFLICT(connection_id, briefing_date) DO UPDATE
           SET status = 'sending', summary_text = EXCLUDED.summary_text,
               attempt_count = whatsapp_daily_briefing_runs.attempt_count + 1,
               error_code = NULL, started_at = now(), updated_at = now()
           WHERE whatsapp_daily_briefing_runs.status = 'failed'
             AND whatsapp_daily_briefing_runs.attempt_count < 3
         RETURNING id`,
        [connection.id, briefingDate, connection.recipient_phone, summary],
      ))[0];
      if (!run) {
        skipped++;
        continue;
      }

      try {
        // Recheck the readiness gate immediately before sending.
        const stillReady = (await query<{ id: string }>(
          `SELECT id FROM whatsapp_business_connections
            WHERE id = $1 AND status = 'active' AND webhook_verified = true AND daily_briefing_enabled = true
              AND briefing_recipient_phone = $2 AND briefing_recipient_opt_in_at IS NOT NULL`,
          [connection.id, connection.recipient_phone],
        ))[0];
        if (!stillReady) {
          await query(
            `UPDATE whatsapp_daily_briefing_runs SET status = 'failed', error_code = 'CONNECTION_NOT_READY', updated_at = now() WHERE id = $1`,
            [run.id],
          );
          skipped++;
          continue;
        }

        const endpoint = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(connection.phone_number_id)}/messages`);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: connection.recipient_phone.replace(/^\+/, ""),
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLanguage },
              components: [{ type: "body", parameters: [{ type: "text", text: summary }] }],
            },
          }),
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        });
        const providerResult: unknown = await response.json().catch(() => null);
        const providerMessageId = providerResult && typeof providerResult === "object" &&
          "messages" in providerResult && Array.isArray((providerResult as { messages?: unknown }).messages)
          ? ((providerResult as { messages: Array<{ id?: unknown }> }).messages[0]?.id)
          : undefined;
        if (!response.ok || typeof providerMessageId !== "string" || !providerMessageId) {
          const authRejected = getWhatsAppMetaSendErrorCode(response.status, providerResult) === "META_AUTH_OR_PERMISSION_REJECTED";
          await query(
            `UPDATE whatsapp_daily_briefing_runs
                SET status = 'failed', error_code = $2, updated_at = now()
              WHERE id = $1`,
            [run.id, getWhatsAppMetaSendErrorCode(response.status, providerResult)],
          );
          if (authRejected) {
            await query(
              `UPDATE whatsapp_business_connections
                  SET status = 'error', daily_briefing_enabled = false, last_error_code = 'META_AUTH_OR_PERMISSION_REJECTED', updated_at = now()
                WHERE id = $1 AND status = 'active'`,
              [connection.id],
            );
          }
          failed++;
          continue;
        }

        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO whatsapp_messages
              (org_id, agent_id, connection_id, provider_message_id, direction, from_phone, to_phone,
               message_type, body, status, provider_timestamp, payload)
             VALUES($1, $2, $3, $4, 'outbound', $5, $6, 'template', $7, 'sent', now(), $8::jsonb)
             ON CONFLICT(provider_message_id) DO NOTHING`,
            [connection.org_id, connection.agent_id, connection.id, providerMessageId,
              connection.display_phone_number, connection.recipient_phone, summary,
              JSON.stringify({ templateName, templateLanguage, briefingRunId: run.id })],
          );
          // A fast status webhook can arrive before the send response is persisted. Reconcile any such durable status event.
          const earlyStatus = (await client.query<{ status: string; timestamp: string | null }>(
            `SELECT payload->>'status' AS status, payload->>'timestamp' AS timestamp
               FROM whatsapp_webhook_events
              WHERE event_type = 'status' AND payload->>'id' = $1
              ORDER BY received_at DESC LIMIT 1`,
            [providerMessageId],
          )).rows[0];
          if (earlyStatus) {
            const seconds = earlyStatus.timestamp && /^\d{1,12}$/.test(earlyStatus.timestamp)
              ? Number(earlyStatus.timestamp) : Number.NaN;
            const providerDate = Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 4_102_444_800
              ? new Date(seconds * 1000) : new Date();
            const safeStatus = ["sent", "delivered", "read", "failed", "deleted"].includes(earlyStatus.status)
              ? earlyStatus.status : "unknown";
            const existingMessage = (await client.query<{ status: string }>(
              `SELECT status FROM whatsapp_messages WHERE provider_message_id = $1 FOR UPDATE`,
              [providerMessageId],
            )).rows[0];
            if (existingMessage) {
              const nextStatus = advanceWhatsAppMessageStatus(existingMessage.status, safeStatus);
              await client.query(
                `UPDATE whatsapp_messages SET status = $2,
                   status_updated_at = GREATEST(status_updated_at, $3), updated_at = now()
                 WHERE provider_message_id = $1`,
                [providerMessageId, nextStatus, providerDate],
              );
            }
          }
          await client.query(
            `UPDATE whatsapp_daily_briefing_runs
                SET status = 'sent', provider_message_id = $2, sent_at = now(), updated_at = now(), error_code = NULL
              WHERE id = $1`,
            [run.id, providerMessageId],
          );
          await client.query(
            `UPDATE whatsapp_business_connections SET daily_briefing_last_sent_on = $2::date, updated_at = now()
              WHERE id = $1`,
            [connection.id, briefingDate],
          );
        });
        sent++;
      } catch {
        // Never log access tokens or provider response bodies. A "sending" run is not retried automatically because Meta may have accepted it before a network failure.
        await query(
          `UPDATE whatsapp_daily_briefing_runs SET error_code = 'SEND_OR_PERSIST_FAILED', updated_at = now() WHERE id = $1 AND status = 'sending'`,
          [run.id],
        ).catch(() => []);
        failed++;
      }
    }
    return NextResponse.json({ ok: true, date: briefingDate, scanned: connections.length, sent, failed, skipped });
  } catch (err) {
    console.error("[whatsapp daily briefing] job failed", err);
    return NextResponse.json({ error: "WhatsApp daily briefing job failed" }, { status: 500 });
  }
}
