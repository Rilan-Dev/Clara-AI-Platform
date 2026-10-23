/**
 * src/modules/embed/core/api-keys-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All DB operations for API keys and rate-limit counters.
 *
 * Key format: "clr_" + 32 random hex chars → e.g. "clr_a1b2c3d4e5f6..."
 * Only the SHA-256 hash of the full key is stored in the DB.
 * The raw key is returned exactly once at creation time and never again.
 *
 * Phase 3 additions:
 *   - OrgPlanLimits type + getOrgPlanForKey()  — fetch plan caps from DB
 *   - getOrgDailyUsage()                        — total requests last 24 h (org-wide)
 *   - checkDailyQuota()                         — read-only quota gate
 */

import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiKey = {
  id: string;
  kbId: string;
  orgId: string;
  name: string;
  keyPrefix: string;
  allowedOrigins: string[];
  isActive: boolean;
  rateLimitPerHour: number;
  designEditEnabled: boolean;      // ← may call PATCH /api/embed/design
  createdBy: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type CreateApiKeyResult = {
  key: ApiKey;
  rawKey: string;
};

export type ValidatedKey = {
  keyId: string;
  kbId: string;
  orgId: string;
  allowedOrigins: string[];
  rateLimitPerHour: number;
  designEditEnabled: boolean;      // ← gating field for /api/embed/design
};

/** Subscription plan limits relevant to the embed API layer. */
export type OrgPlanLimits = {
  maxReqDay:    number;  // -1 = unlimited, 0 = none
  voiceEnabled: boolean;
  planId:       string;
  planName:     string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateRawKey(): string {
  return "clr_" + randomBytes(24).toString("hex");
}

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id:                row.id as string,
    kbId:              row.kb_id as string,
    orgId:             row.org_id as string,
    name:              row.name as string,
    keyPrefix:         row.key_prefix as string,
    allowedOrigins:    (row.allowed_origins as string[]) ?? [],
    isActive:          row.is_active as boolean,
    rateLimitPerHour:  row.rate_limit_per_hour as number,
    designEditEnabled: Boolean(row.design_edit_enabled),
    createdBy:         (row.created_by as string) ?? null,
    lastUsedAt:        row.last_used_at ? new Date(row.last_used_at as string) : null,
    createdAt:         new Date(row.created_at as string),
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createApiKey(opts: {
  kbId: string;
  orgId: string;
  name?: string;
  allowedOrigins?: string[];
  rateLimitPerHour?: number;
  createdBy?: string;
}, client?: PoolClient): Promise<CreateApiKeyResult> {
  const rawKey    = generateRawKey();
  const keyHash   = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 16);

  const result = await (client ?? pool).query<Record<string, unknown>>(
    `INSERT INTO api_keys
       (kb_id, org_id, name, key_prefix, key_hash, allowed_origins, rate_limit_per_hour, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      opts.kbId,
      opts.orgId,
      opts.name ?? "Default",
      keyPrefix,
      keyHash,
      opts.allowedOrigins ?? [],
      opts.rateLimitPerHour ?? 500,
      opts.createdBy ?? null,
    ]
  );

  return { key: rowToApiKey(result.rows[0]!), rawKey };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listApiKeys(kbId: string): Promise<ApiKey[]> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM api_keys WHERE kb_id = $1 ORDER BY created_at ASC`,
    [kbId]
  );
  return result.rows.map(rowToApiKey);
}

export async function getApiKeyById(keyId: string): Promise<ApiKey | null> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM api_keys WHERE id = $1`,
    [keyId]
  );
  return result.rows[0] ? rowToApiKey(result.rows[0]) : null;
}

export async function validateApiKey(rawKey: string): Promise<ValidatedKey | null> {
  if (!rawKey || !rawKey.startsWith("clr_")) return null;

  const keyHash = hashKey(rawKey);

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
       ak.id                  AS key_id,
       ak.kb_id,
       ak.org_id,
       ak.allowed_origins,
       ak.rate_limit_per_hour,
       ak.design_edit_enabled,
       kb.status              AS kb_status
     FROM api_keys ak
     JOIN knowledge_bases kb ON kb.id = ak.kb_id
     WHERE ak.key_hash = $1
       AND ak.is_active = TRUE`,
    [keyHash]
  );

  if (!result.rows[0]) return null;
  const row = result.rows[0];
  if (row.kb_status !== "active") return null;

  pool
    .query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [row.key_id])
    .catch(() => {});

  return {
    keyId:             row.key_id as string,
    kbId:              row.kb_id as string,
    orgId:             row.org_id as string,
    allowedOrigins:    (row.allowed_origins as string[]) ?? [],
    rateLimitPerHour:  row.rate_limit_per_hour as number,
    designEditEnabled: Boolean(row.design_edit_enabled),
  };
}

// ── Plan limits (Phase 3) ─────────────────────────────────────────────────────

/**
 * Org-based variant of getOrgPlanForKey — used by public session tokens
 * (pub_…) which have no api_keys row: the org's subscription governs the
 * same daily-quota / voice-entitlement gates as keyed embeds.
 */
export async function getOrgPlanForOrg(orgId: string): Promise<OrgPlanLimits | null> {
  const result = await pool.query<{
    max_req_day:   number;
    voice_enabled: boolean;
    plan_id:       string;
    plan_name:     string;
  }>(
    `SELECT
       COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
       COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
       sp.id   AS plan_id,
       COALESCE(pv.name, sp.name) AS plan_name
     FROM org_subscriptions  os
     JOIN subscription_plans sp ON sp.id = os.plan_id
     LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
     WHERE os.org_id = $1
       AND os.status IN ('active', 'trialing')
     LIMIT 1`,
    [orgId]
  );

  if (!result.rows[0]) return null;
  const row = result.rows[0];

  return {
    maxReqDay:    row.max_req_day,
    voiceEnabled: row.voice_enabled,
    planId:       row.plan_id,
    planName:     row.plan_name,
  };
}

/**
 * Fetch the subscription plan limits that are relevant to the embed API layer,
 * looked up via the api_key's org_id → org_subscriptions → subscription_plans.
 *
 * Returns null only if no subscription row exists (treat as no access).
 */
export async function getOrgPlanForKey(keyId: string): Promise<OrgPlanLimits | null> {
  const result = await pool.query<{
    max_req_day:   number;
    voice_enabled: boolean;
    plan_id:       string;
    plan_name:     string;
  }>(
    `SELECT
       COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
       COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
       sp.id   AS plan_id,
       COALESCE(pv.name, sp.name) AS plan_name
     FROM api_keys ak
     JOIN org_subscriptions  os ON os.org_id  = ak.org_id
     JOIN subscription_plans sp ON sp.id      = os.plan_id
     LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
     WHERE ak.id = $1
       AND os.status IN ('active', 'trialing')
     LIMIT 1`,
    [keyId]
  );

  if (!result.rows[0]) return null;
  const row = result.rows[0];

  return {
    maxReqDay:    row.max_req_day,
    voiceEnabled: row.voice_enabled,
    planId:       row.plan_id,
    planName:     row.plan_name,
  };
}

// ── Daily quota (Phase 3) ─────────────────────────────────────────────────────

/**
 * Sum all request counts across every API key belonging to the org
 * for the rolling 24-hour window.  Used to enforce max_req_day.
 */
export async function getOrgDailyUsage(orgId: string): Promise<number> {
  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(aku.count), 0) AS total
     FROM api_key_usage aku
     JOIN api_keys ak ON ak.id = aku.key_id
     WHERE ak.org_id = $1
       AND aku.hour  >= now() - INTERVAL '24 hours'`,
    [orgId]
  );
  return parseInt(result.rows[0]?.total ?? "0", 10);
}

/**
 * Read-only quota gate.  Call BEFORE checkAndIncrementRateLimit so we don't
 * count a request that will be rejected anyway.
 *
 * Returns { allowed, current, limit }.
 *   -1  limit = unlimited (always allowed).
 *   0   limit = no access (always blocked).
 */
export async function checkDailyQuota(
  orgId: string,
  maxReqDay: number
): Promise<{ allowed: boolean; current: number; limit: number }> {
  if (maxReqDay === -1) {
    // Unlimited — skip the DB read entirely
    return { allowed: true, current: 0, limit: -1 };
  }

  const current = await getOrgDailyUsage(orgId);

  return {
    allowed: maxReqDay > 0 && current < maxReqDay,
    current,
    limit: maxReqDay,
  };
}

// ── Hourly rate limit ─────────────────────────────────────────────────────────

export async function checkAndIncrementRateLimit(
  keyId: string,
  limitPerHour: number
): Promise<boolean> {
  if (limitPerHour === 0) return true;

  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0);

  const result = await pool.query<{ count: string }>(
    `INSERT INTO api_key_usage (key_id, hour, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key_id, hour)
     DO UPDATE SET count = api_key_usage.count + 1
     RETURNING count`,
    [keyId, currentHour.toISOString()]
  );

  const count = parseInt(result.rows[0]?.count ?? "1", 10);
  return count <= limitPerHour;
}

// ── Update / Revoke ───────────────────────────────────────────────────────────

export async function revokeApiKey(keyId: string): Promise<void> {
  await pool.query(`UPDATE api_keys SET is_active = FALSE WHERE id = $1`, [keyId]);
}

export async function updateApiKey(
  keyId: string,
  updates: { name?: string; allowedOrigins?: string[]; rateLimitPerHour?: number; designEditEnabled?: boolean }
): Promise<ApiKey | null> {
  const sets: string[]    = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.name              !== undefined) { sets.push(`name = $${i++}`);                values.push(updates.name); }
  if (updates.allowedOrigins    !== undefined) { sets.push(`allowed_origins = $${i++}`);     values.push(updates.allowedOrigins); }
  if (updates.rateLimitPerHour  !== undefined) { sets.push(`rate_limit_per_hour = $${i++}`); values.push(updates.rateLimitPerHour); }
  if (updates.designEditEnabled !== undefined) { sets.push(`design_edit_enabled = $${i++}`); values.push(updates.designEditEnabled); }
  if (sets.length === 0) return getApiKeyById(keyId);

  values.push(keyId);
  const result = await pool.query<Record<string, unknown>>(
    `UPDATE api_keys SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );

  return result.rows[0] ? rowToApiKey(result.rows[0]) : null;
}

// ── Usage stats ───────────────────────────────────────────────────────────────

export type KeyUsageStat = {
  keyId: string;
  totalLast24h: number;
  totalLast7d: number;
  thisHour: number;
};

export async function getKeyUsageStats(keyId: string): Promise<KeyUsageStat> {
  const result = await pool.query<{ total_24h: string; total_7d: string; this_hour: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN hour >= now() - INTERVAL '24 hours' THEN count ELSE 0 END), 0) AS total_24h,
       COALESCE(SUM(CASE WHEN hour >= now() - INTERVAL '7 days'   THEN count ELSE 0 END), 0) AS total_7d,
       COALESCE(SUM(CASE WHEN hour >= date_trunc('hour', now())    THEN count ELSE 0 END), 0) AS this_hour
     FROM api_key_usage
     WHERE key_id = $1`,
    [keyId]
  );

  const row = result.rows[0];
  return {
    keyId,
    totalLast24h: parseInt(row?.total_24h ?? "0", 10),
    totalLast7d:  parseInt(row?.total_7d  ?? "0", 10),
    thisHour:     parseInt(row?.this_hour ?? "0", 10),
  };
}

export async function getAllKeysUsageStats(kbId: string): Promise<KeyUsageStat[]> {
  const keys = await listApiKeys(kbId);
  return Promise.all(keys.map((k) => getKeyUsageStats(k.id)));
}
