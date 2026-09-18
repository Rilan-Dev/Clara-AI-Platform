/**
 * src/modules/phone/core/db.ts
 * Database operations for phone call configs and logs.
 */
import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { insertOutboxEvent } from "@/modules/events/outbox-db";
import type { PhoneCallConfig, PhoneCallLog, PhoneProvider, PhoneVoiceEngine } from "./types";

function rowToConfig(r: Record<string, unknown>): PhoneCallConfig {
  return {
    id: r.id as string,
    kbId: r.kb_id as string,
    provider: r.provider as PhoneProvider,
    voiceEngine: (r.voice_engine === "elevenlabs" ? "elevenlabs" : "openai") as PhoneVoiceEngine,
    enabled: Boolean(r.enabled),
    phoneNumber: (r.phone_number as string) ?? null,
    greetingMessage: r.greeting_message as string,
    maxCallDurationSec: Number(r.max_call_duration_sec),
    recordCalls: Boolean(r.record_calls),
    transcribeCalls: Boolean(r.transcribe_calls),
    webhookUrlOverride: (r.webhook_url_override as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getPhoneConfigsByKb(kbId: string): Promise<PhoneCallConfig[]> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_configs WHERE kb_id = $1 ORDER BY created_at ASC`,
    [kbId],
  );
  return rows.map(rowToConfig);
}

export async function getPhoneConfigByNumber(phoneNumber: string): Promise<PhoneCallConfig | null> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_configs WHERE phone_number = $1 AND enabled = TRUE LIMIT 1`,
    [phoneNumber],
  );
  return rows[0] ? rowToConfig(rows[0]) : null;
}

export async function getPhoneConfigById(id: string): Promise<PhoneCallConfig | null> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_configs WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ? rowToConfig(rows[0]) : null;
}

export async function upsertPhoneConfig(
  kbId: string,
  input: Partial<Omit<PhoneCallConfig, "id" | "kbId" | "createdAt" | "updatedAt">>,
): Promise<PhoneCallConfig> {
  const { rows } = await pool.query(
    `
    INSERT INTO phone_call_configs
      (kb_id, provider, voice_engine, enabled, phone_number, greeting_message,
       max_call_duration_sec, record_calls, transcribe_calls, webhook_url_override)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (kb_id, phone_number) DO UPDATE SET
      provider              = EXCLUDED.provider,
      voice_engine          = EXCLUDED.voice_engine,
      enabled               = EXCLUDED.enabled,
      greeting_message      = EXCLUDED.greeting_message,
      max_call_duration_sec = EXCLUDED.max_call_duration_sec,
      record_calls          = EXCLUDED.record_calls,
      transcribe_calls      = EXCLUDED.transcribe_calls,
      webhook_url_override  = EXCLUDED.webhook_url_override,
      updated_at            = now()
    RETURNING *
  `,
    [
      kbId,
      input.provider ?? "twilio",
      input.voiceEngine ?? "openai",
      input.enabled ?? false,
      input.phoneNumber ?? null,
      input.greetingMessage ?? "Hello! How can I help you today?",
      input.maxCallDurationSec ?? 300,
      input.recordCalls ?? false,
      input.transcribeCalls ?? true,
      input.webhookUrlOverride ?? null,
    ],
  );
  return rowToConfig(rows[0]);
}

export async function deletePhoneConfig(id: string): Promise<void> {
  await pool.query(`DELETE FROM phone_call_configs WHERE id = $1`, [id]);
}

export async function insertCallLog(data: {
  configId: string | null;
  kbId: string | null;
  provider: PhoneProvider;
  callSid: string;
  fromNumber: string | null;
  toNumber: string | null;
  direction?: "inbound" | "outbound";
}): Promise<string> {
  const { rows } = await pool.query(
    `
    INSERT INTO phone_call_logs (config_id, kb_id, provider, call_sid, from_number, to_number, direction)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
  `,
    [data.configId, data.kbId, data.provider, data.callSid, data.fromNumber, data.toNumber, data.direction ?? "inbound"],
  );
  return rows[0].id as string;
}

const TERMINAL_CALL_STATUSES = new Set([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
  "cancelled",
  "timeout",
]);

function isSafeWebhookUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function updateCallLog(
  callSid: string,
  updates: {
    status?: string;
    answeredAt?: Date;
    endedAt?: Date;
    durationSec?: number;
    turnCount?: number;
    transcript?: unknown;
    recordingUrl?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (updates.status !== undefined) { sets.push(`status = $${i++}`); vals.push(updates.status); }
  if (updates.answeredAt !== undefined) { sets.push(`answered_at = $${i++}`); vals.push(updates.answeredAt); }
  if (updates.endedAt !== undefined) { sets.push(`ended_at = $${i++}`); vals.push(updates.endedAt); }
  if (updates.durationSec !== undefined) { sets.push(`duration_sec = $${i++}`); vals.push(updates.durationSec); }
  if (updates.turnCount !== undefined) { sets.push(`turn_count = $${i++}`); vals.push(updates.turnCount); }
  if (updates.transcript !== undefined) { sets.push(`transcript = $${i++}`); vals.push(JSON.stringify(updates.transcript)); }
  if (updates.recordingUrl !== undefined) { sets.push(`recording_url = $${i++}`); vals.push(updates.recordingUrl); }
  if (updates.errorMessage !== undefined) { sets.push(`error_message = $${i++}`); vals.push(updates.errorMessage); }
  if (!sets.length) return;
  vals.push(callSid);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE phone_call_logs SET ${sets.join(",")} WHERE call_sid = $${i}`,
      vals,
    );

    const current = await client.query<{
      id: string;
      config_id: string | null;
      kb_id: string | null;
      status: string | null;
      answered_at: Date | null;
      ended_at: Date | null;
      duration_sec: number | null;
      turn_count: number | null;
      transcript: unknown;
      recording_url: string | null;
      error_message: string | null;
      webhook_url_override: string | null;
    }>(
      `SELECT l.id, l.config_id, l.kb_id, l.status, l.answered_at, l.ended_at,
              l.duration_sec, l.turn_count, l.transcript, l.recording_url,
              l.error_message, c.webhook_url_override
       FROM phone_call_logs l
       LEFT JOIN phone_call_configs c ON c.id = l.config_id
       WHERE l.call_sid = $1
       LIMIT 1
       FOR UPDATE`,
      [callSid],
    );

    const row = current.rows[0];
    const terminal = Boolean(row && (row.ended_at || (row.status && TERMINAL_CALL_STATUSES.has(row.status))));
    if (row && terminal && isSafeWebhookUrl(row.webhook_url_override)) {
      await insertOutboxEvent(client, {
        id: randomUUID(),
        eventType: "webhook.phone.call.completed",
        aggregateType: "phone_call",
        aggregateId: row.id,
        dedupeKey: `phone.call.completed:${row.id}`,
        routingKey: "webhook.phone.call.completed",
        payload: {
          targetUrl: row.webhook_url_override,
          callSid,
          kbId: row.kb_id,
          status: row.status,
          answeredAt: row.answered_at?.toISOString() ?? null,
          endedAt: row.ended_at?.toISOString() ?? null,
          durationSec: row.duration_sec ?? null,
          turnCount: row.turn_count ?? null,
          transcript: row.transcript ?? null,
          recordingUrl: row.recording_url ?? null,
          errorMessage: row.error_message ?? null,
        },
      });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getCallLogs(kbId: string, limit = 50): Promise<PhoneCallLog[]> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_logs WHERE kb_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [kbId, limit],
  );
  return rows.map(
    (r) => ({
      id: r.id,
      configId: r.config_id ?? null,
      kbId: r.kb_id ?? null,
      provider: r.provider,
      callSid: r.call_sid,
      fromNumber: r.from_number ?? null,
      toNumber: r.to_number ?? null,
      direction: r.direction,
      status: r.status,
      startedAt: r.started_at,
      answeredAt: r.answered_at ?? null,
      endedAt: r.ended_at ?? null,
      durationSec: r.duration_sec ?? null,
      turnCount: r.turn_count,
      transcript: r.transcript ?? [],
      recordingUrl: r.recording_url ?? null,
      errorMessage: r.error_message ?? null,
      createdAt: r.created_at,
    }) as PhoneCallLog,
  );
}

export async function getPlatformEnvSettings(): Promise<
  Array<{
    key: string;
    value: string;
    description: string;
    category: string;
    isSecret: boolean;
    requiresRestart: boolean;
    updatedAt: string;
  }>
> {
  const { rows } = await pool.query(
    `SELECT key, value, description, category, is_secret, requires_restart, updated_at
     FROM platform_env_settings ORDER BY category, key`,
  );
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    description: r.description,
    category: r.category,
    isSecret: r.is_secret,
    requiresRestart: r.requires_restart,
    updatedAt: r.updated_at,
  }));
}

export async function setPlatformEnvSetting(key: string, value: string, updatedBy?: string | null): Promise<void> {
  const safeUpdatedBy = updatedBy && /^[0-9a-f-]{36}$/i.test(updatedBy) ? updatedBy : null;
  await pool.query(
    `INSERT INTO platform_env_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3`,
    [key, value, safeUpdatedBy],
  );
  process.env[key] = value;
}

export async function syncEnvFromDb(): Promise<void> {
  const settings = await getPlatformEnvSettings();
  for (const { key, value } of settings) if (value.trim()) process.env[key] = value;
}

export async function checkPhoneCallsEnabled(kbId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT sp.phone_calls_enabled
     FROM knowledge_bases kb
     JOIN agents p ON p.id = kb.agent_id
     JOIN org_subscriptions os ON os.org_id = p.org_id AND os.status = 'active'
     JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE kb.id = $1
     LIMIT 1`,
    [kbId],
  );
  return rows[0]?.phone_calls_enabled === true;
}
