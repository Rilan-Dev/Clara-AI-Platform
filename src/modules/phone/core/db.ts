/**
 * src/modules/phone/core/db.ts
 * Database operations for phone call configs and logs.
 */
import { pool } from "@/lib/db";
import type { PhoneCallConfig, PhoneCallLog, PhoneProvider } from "./types";

function rowToConfig(r: Record<string, unknown>): PhoneCallConfig {
  return {
    id: r.id as string,
    kbId: r.kb_id as string,
    provider: r.provider as PhoneProvider,
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

export async function getPhoneConfigsByKb(
  kbId: string,
): Promise<PhoneCallConfig[]> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_configs WHERE kb_id = $1 ORDER BY created_at ASC`,
    [kbId],
  );
  return rows.map(rowToConfig);
}

export async function getPhoneConfigByNumber(
  phoneNumber: string,
): Promise<PhoneCallConfig | null> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_configs WHERE phone_number = $1 AND enabled = TRUE LIMIT 1`,
    [phoneNumber],
  );
  return rows[0] ? rowToConfig(rows[0]) : null;
}

export async function getPhoneConfigById(
  id: string,
): Promise<PhoneCallConfig | null> {
  const { rows } = await pool.query(
    `SELECT * FROM phone_call_configs WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ? rowToConfig(rows[0]) : null;
}

export async function upsertPhoneConfig(
  kbId: string,
  input: Partial<
    Omit<PhoneCallConfig, "id" | "kbId" | "createdAt" | "updatedAt">
  >,
): Promise<PhoneCallConfig> {
  const { rows } = await pool.query(
    `
    INSERT INTO phone_call_configs
      (kb_id, provider, enabled, phone_number, greeting_message,
       max_call_duration_sec, record_calls, transcribe_calls, webhook_url_override)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (kb_id, phone_number) DO UPDATE SET
      provider             = EXCLUDED.provider,
      enabled              = EXCLUDED.enabled,
      greeting_message     = EXCLUDED.greeting_message,
      max_call_duration_sec= EXCLUDED.max_call_duration_sec,
      record_calls         = EXCLUDED.record_calls,
      transcribe_calls     = EXCLUDED.transcribe_calls,
      webhook_url_override = EXCLUDED.webhook_url_override,
      updated_at           = now()
    RETURNING *
  `,
    [
      kbId,
      input.provider ?? "twilio",
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
}): Promise<string> {
  const { rows } = await pool.query(
    `
    INSERT INTO phone_call_logs (config_id, kb_id, provider, call_sid, from_number, to_number)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
  `,
    [
      data.configId,
      data.kbId,
      data.provider,
      data.callSid,
      data.fromNumber,
      data.toNumber,
    ],
  );
  return rows[0].id as string;
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
  if (updates.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(updates.status);
  }
  if (updates.answeredAt !== undefined) {
    sets.push(`answered_at = $${i++}`);
    vals.push(updates.answeredAt);
  }
  if (updates.endedAt !== undefined) {
    sets.push(`ended_at = $${i++}`);
    vals.push(updates.endedAt);
  }
  if (updates.durationSec !== undefined) {
    sets.push(`duration_sec = $${i++}`);
    vals.push(updates.durationSec);
  }
  if (updates.turnCount !== undefined) {
    sets.push(`turn_count = $${i++}`);
    vals.push(updates.turnCount);
  }
  if (updates.transcript !== undefined) {
    sets.push(`transcript = $${i++}`);
    vals.push(JSON.stringify(updates.transcript));
  }
  if (updates.recordingUrl !== undefined) {
    sets.push(`recording_url = $${i++}`);
    vals.push(updates.recordingUrl);
  }
  if (updates.errorMessage !== undefined) {
    sets.push(`error_message = $${i++}`);
    vals.push(updates.errorMessage);
  }
  if (!sets.length) return;
  vals.push(callSid);
  await pool.query(
    `UPDATE phone_call_logs SET ${sets.join(",")} WHERE call_sid = $${i}`,
    vals,
  );
}

export async function getCallLogs(
  kbId: string,
  limit = 50,
): Promise<PhoneCallLog[]> {
  const { rows } = await pool.query(
    `
    SELECT * FROM phone_call_logs WHERE kb_id = $1 ORDER BY created_at DESC LIMIT $2
  `,
    [kbId, limit],
  );
  return rows.map(
    (r) =>
      ({
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

// ── Platform env settings ─────────────────────────────────────────────────────

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

export async function setPlatformEnvSetting(
  key: string,
  value: string,
  updatedBy?: string | null,
): Promise<void> {
  // updatedBy must be a valid UUID or NULL — never pass a plain string like "platform-admin"
  const safeUpdatedBy =
    updatedBy && /^[0-9a-f-]{36}$/i.test(updatedBy) ? updatedBy : null;
  await pool.query(
    `
    INSERT INTO platform_env_settings (key, value, updated_at, updated_by)
    VALUES ($1, $2, now(), $3)
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3
  `,
    [key, value, safeUpdatedBy],
  );
  // Also update process.env so it takes effect immediately without restart
  process.env[key] = value;
}

export async function checkPhoneCallsEnabled(kbId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `
    SELECT sp.phone_calls_enabled
    FROM knowledge_bases kb
    JOIN projects p ON p.id = kb.project_id
    JOIN org_subscriptions os ON os.org_id = p.org_id AND os.status = 'active'
    JOIN subscription_plans sp ON sp.id = os.plan_id
    WHERE kb.id = $1
    LIMIT 1
  `,
    [kbId],
  );
  return rows[0]?.phone_calls_enabled === true;
}
