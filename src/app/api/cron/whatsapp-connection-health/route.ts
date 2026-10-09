import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { ENCRYPTION_KEY } from "@/lib/secrets";
import { classifyWhatsAppGraphHealth } from "@/modules/integrations/whatsapp-briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Connection = {
  id: string;
  waba_id: string;
  access_token: string;
};

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function probe(connection: Connection): Promise<"healthy" | "rejected" | "unavailable"> {
  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(connection.waba_id)}`);
    url.searchParams.set("fields", "id");
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${connection.access_token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const body: unknown = await response.json().catch(() => null);
    const classification = classifyWhatsAppGraphHealth(response.status, body);
    if (classification === "healthy" && (!body || typeof body !== "object" || !("id" in body) || (body as { id?: unknown }).id !== connection.waba_id)) {
      return "unavailable";
    }
    return classification;
  } catch {
    return "unavailable";
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ENCRYPTION_KEY.length < 32) return NextResponse.json({ error: "WhatsApp encryption is not configured" }, { status: 503 });

  try {
    await ensureMigrated();
    const expired = await query<{ id: string }>(
      `UPDATE whatsapp_business_connections
          SET status = 'error', daily_briefing_enabled = false, last_error_code = 'TOKEN_EXPIRED',
              last_health_check_at = now(), updated_at = now()
        WHERE status = 'active' AND access_token_expires_at IS NOT NULL AND access_token_expires_at <= now()
        RETURNING id`,
      [],
    );
    const connections = await query<Connection>(
      `SELECT id, waba_id, pgp_sym_decrypt(access_token_encrypted, $1) AS access_token
         FROM whatsapp_business_connections
        WHERE status = 'active'
          AND (access_token_expires_at IS NULL OR access_token_expires_at > now())
          AND (last_health_check_at IS NULL OR last_health_check_at < now() - interval '15 minutes')
        ORDER BY last_health_check_at ASC NULLS FIRST, created_at ASC
        LIMIT 20`,
      [ENCRYPTION_KEY],
    );

    let healthy = 0;
    let rejected = 0;
    let unavailable = 0;
    for (let offset = 0; offset < connections.length; offset += 5) {
      const batch = connections.slice(offset, offset + 5);
      await Promise.all(batch.map(async (connection) => {
        const result = await probe(connection);
        if (result === "rejected") {
          await query(
            `UPDATE whatsapp_business_connections
                SET status = 'error', daily_briefing_enabled = false,
                    last_error_code = 'META_AUTH_OR_PERMISSION_REJECTED',
                    last_health_check_at = now(), updated_at = now()
              WHERE id = $1 AND status = 'active'`,
            [connection.id],
          );
          rejected++;
          return;
        }
        await query(
          `UPDATE whatsapp_business_connections
              SET last_health_check_at = now(),
                  last_error_code = CASE
                    WHEN $2 = 'healthy' AND last_error_code = 'META_AUTH_OR_PERMISSION_REJECTED' THEN NULL
                    ELSE last_error_code
                  END
            WHERE id = $1 AND status = 'active'`,
          [connection.id, result],
        );
        if (result === "healthy") healthy++;
        else unavailable++;
      }));
    }

    return NextResponse.json({
      ok: true,
      expired: expired.length,
      checked: connections.length,
      healthy,
      rejected,
      unavailable,
    });
  } catch (err) {
    console.error("[whatsapp connection health] job failed", err);
    return NextResponse.json({ error: "WhatsApp connection health check failed" }, { status: 500 });
  }
}
