/**
 * src/modules/embed/core/api-keys-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All DB operations for API keys and rate-limit counters.
 *
 * Key format: "clr_" + 32 random hex chars → e.g. "clr_a1b2c3d4e5f6..."
 * Only the SHA-256 hash of the full key is stored in the DB.
 * The raw key is returned exactly once at creation time and never again.
 */

import { createHash, randomBytes } from "node:crypto";
import { pool } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiKey = {
  id: string;
  kbId: string;
  orgId: string;
  name: string;
  keyPrefix: string;        // first 16 chars of the raw key (safe to display)
  allowedOrigins: string[]; // empty = any origin allowed
  isActive: boolean;
  rateLimitPerHour: number; // 0 = unlimited
  createdBy: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type CreateApiKeyResult = {
  key: ApiKey;
  rawKey: string; // returned ONCE — never retrievable again
};

export type ValidatedKey = {
  keyId: string;
  kbId: string;
  orgId: string;
  allowedOrigins: string[];
  rateLimitPerHour: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateRawKey(): string {
  return "clr_" + randomBytes(24).toString("hex"); // 52 chars total
}

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id:               row.id as string,
    kbId:             row.kb_id as string,
    orgId:            row.org_id as string,
    name:             row.name as string,
    keyPrefix:        row.key_prefix as string,
    allowedOrigins:   (row.allowed_origins as string[]) ?? [],
    isActive:         row.is_active as boolean,
    rateLimitPerHour: row.rate_limit_per_hour as number,
    createdBy:        (row.created_by as string) ?? null,
    lastUsedAt:       row.last_used_at ? new Date(row.last_used_at as string) : null,
    createdAt:        new Date(row.created_at as string),
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
}): Promise<CreateApiKeyResult> {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 16); // "clr_" + 12 chars

  const result = await pool.query<Record<string, unknown>>(
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

/**
 * Validate an incoming raw API key.
 * Returns the key's metadata (without secrets) if valid and active.
 * Returns null if key does not exist, is revoked, or KB is archived.
 */
export async function validateApiKey(rawKey: string): Promise<ValidatedKey | null> {
  if (!rawKey || !rawKey.startsWith("clr_")) return null;

  const keyHash = hashKey(rawKey);

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
       ak.id           AS key_id,
       ak.kb_id,
       ak.org_id,
       ak.allowed_origins,
       ak.rate_limit_per_hour,
       kb.status       AS kb_status
     FROM api_keys ak
     JOIN knowledge_bases kb ON kb.id = ak.kb_id
     WHERE ak.key_hash = $1
       AND ak.is_active = TRUE`,
    [keyHash]
  );

  if (!result.rows[0]) return null;
  const row = result.rows[0];

  // Block requests if the KB has been archived
  if (row.kb_status !== "active") return null;

  // Fire-and-forget last_used_at update
  pool
    .query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [row.key_id])
    .catch(() => {});

  return {
    keyId:            row.key_id as string,
    kbId:             row.kb_id as string,
    orgId:            row.org_id as string,
    allowedOrigins:   (row.allowed_origins as string[]) ?? [],
    rateLimitPerHour: row.rate_limit_per_hour as number,
  };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Atomically increment the usage counter for the current UTC hour.
 * Returns true if the request is within the limit, false if over.
 * 0 = unlimited.
 */
export async function checkAndIncrementRateLimit(
  keyId: string,
  limitPerHour: number
): Promise<boolean> {
  if (limitPerHour === 0) return true; // unlimited

  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0); // truncate to hour

  // Upsert: increment counter, return new value
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
  await pool.query(
    `UPDATE api_keys SET is_active = FALSE WHERE id = $1`,
    [keyId]
  );
}

export async function updateApiKey(
  keyId: string,
  updates: { name?: string; allowedOrigins?: string[]; rateLimitPerHour?: number }
): Promise<ApiKey | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(updates.name);
  }
  if (updates.allowedOrigins !== undefined) {
    sets.push(`allowed_origins = $${i++}`);
    values.push(updates.allowedOrigins);
  }
  if (updates.rateLimitPerHour !== undefined) {
    sets.push(`rate_limit_per_hour = $${i++}`);
    values.push(updates.rateLimitPerHour);
  }
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
  const result = await pool.query<{
    total_24h: string;
    total_7d: string;
    this_hour: string;
  }>(
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
