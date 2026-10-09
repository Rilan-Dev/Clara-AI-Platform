import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

type IncomingMessage = {
  id?: string; from?: string; timestamp?: string; type?: string;
  text?: { body?: string }; [key: string]: unknown;
};
type DeliveryStatus = { id?: string; status?: string; timestamp?: string; recipient_id?: string; [key: string]: unknown };
type ChangeValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: IncomingMessage[];
  statuses?: DeliveryStatus[];
  [key: string]: unknown;
};
type WebhookChange = { field?: string; value?: ChangeValue };
type WebhookPayload = { entry?: Array<{ changes?: WebhookChange[] }> };

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const supplied = header.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return equalSecret(expected, supplied.toLowerCase());
}

function eventKey(kind: string, item: { id?: string; status?: string; timestamp?: string }): string {
  return createHmac("sha256", "clara-whatsapp-event-v1")
    .update([kind, item.id ?? "", item.status ?? "", item.timestamp ?? ""].join(":"))
    .digest("hex");
}

async function persistEvent(input: {
  key: string; phoneNumberId: string | null; type: string; payload: Record<string, unknown>;
  message?: IncomingMessage; status?: DeliveryStatus;
}) {
  await withTransaction(async (client) => {
    const connection = input.phoneNumberId
      ? (await client.query<{
          id: string; org_id: string; agent_id: string; display_phone_number: string;
        }>(
          `SELECT id, org_id, agent_id, display_phone_number
             FROM whatsapp_business_connections
            WHERE phone_number_id = $1 AND status = 'active' FOR UPDATE`,
          [input.phoneNumberId],
        )).rows[0]
      : undefined;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO whatsapp_webhook_events(event_key, phone_number_id, event_type, payload)
       VALUES($1, $2, $3, $4::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING id`,
      [input.key, input.phoneNumberId, input.type, JSON.stringify(input.payload)],
    );
    if (inserted.rowCount === 0) return;
    if (!connection) {
      await client.query("UPDATE whatsapp_webhook_events SET processed_at = now() WHERE id = $1", [inserted.rows[0].id]);
      return;
    }

    await client.query(
      `UPDATE whatsapp_business_connections
          SET last_webhook_at = now(), webhook_verified = true,
              webhook_verified_at = COALESCE(webhook_verified_at, now()), updated_at = now()
        WHERE id = $1`,
      [connection.id],
    );

    if (input.message?.id) {
      const message = input.message;
      const body = typeof message.text?.body === "string" ? message.text.body.slice(0, 10000) : null;
      const timestamp = typeof message.timestamp === "string" && /^\d{1,12}$/.test(message.timestamp)
        ? new Date(Number(message.timestamp) * 1000) : null;
      await client.query(
        `INSERT INTO whatsapp_messages
          (org_id, agent_id, connection_id, provider_message_id, direction, from_phone, to_phone,
           message_type, body, status, provider_timestamp, payload)
         VALUES($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, 'received', $9, $10::jsonb)
         ON CONFLICT(provider_message_id) DO NOTHING`,
        [connection.org_id, connection.agent_id, connection.id, message.id, message.from ?? null,
          connection.display_phone_number, message.type ?? "unknown", body, timestamp, JSON.stringify(message)],
      );
    }

    if (input.status?.id && input.status.status) {
      const status = ["sent", "delivered", "read", "failed", "deleted"].includes(input.status.status)
        ? input.status.status : "unknown";
      const timestamp = typeof input.status.timestamp === "string" && /^\d{1,12}$/.test(input.status.timestamp)
        ? new Date(Number(input.status.timestamp) * 1000) : new Date();
      await client.query(
        `UPDATE whatsapp_messages
            SET status = CASE WHEN status = 'read' THEN 'read' ELSE $2 END,
                status_updated_at = GREATEST(status_updated_at, $3), updated_at = now(),
                payload = payload || $4::jsonb
          WHERE provider_message_id = $1 AND connection_id = $5`,
        [input.status.id, status, timestamp, JSON.stringify({ lastProviderStatus: input.status }), connection.id],
      );
    }
    await client.query("UPDATE whatsapp_webhook_events SET processed_at = now() WHERE id = $1", [inserted.rows[0].id]);
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = req.nextUrl.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
  if (mode === "subscribe" && expected.length >= 24 && equalSecret(token, expected) && challenge.length <= 2048) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const raw = await req.text();
  if (!appSecret || !validSignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  let payload: WebhookPayload;
  try {
    if (raw.length > 1_000_000) return NextResponse.json({ error: "Webhook payload too large" }, { status: 413 });
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  try {
    await ensureMigrated();
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id ?? null;
        for (const message of value.messages ?? []) {
          if (!message.id) continue;
          await persistEvent({
            key: eventKey("message", { id: message.id }),
            phoneNumberId, type: "message", payload: message as Record<string, unknown>, message,
          });
        }
        for (const status of value.statuses ?? []) {
          if (!status.id || !status.status) continue;
          await persistEvent({
            key: eventKey("status", { id: status.id, status: status.status, timestamp: status.timestamp }),
            phoneNumberId, type: "status", payload: status as Record<string, unknown>, status,
          });
        }
        if (!(value.messages?.length) && !(value.statuses?.length)) {
          const stable = JSON.stringify({ entry, field: change.field, value });
          const key = createHmac("sha256", "clara-whatsapp-event-v1").update(stable).digest("hex");
          await persistEvent({ key, phoneNumberId, type: change.field ?? "account_update", payload: value as Record<string, unknown> });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp webhook] processing failed", err);
    return NextResponse.json({ error: "Webhook event could not be persisted" }, { status: 500 });
  }
}
