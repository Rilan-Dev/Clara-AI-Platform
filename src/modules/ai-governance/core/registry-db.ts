/**
 * src/modules/ai-governance/core/registry-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform AI provider registry service.
 *
 * Provider credentials are stored through the EXISTING secure secret
 * mechanism (platform_env_settings → mirrored into process.env) — this module
 * only records which env key holds each secret plus a masked hint. No usable
 * credential value ever crosses this boundary.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "@/lib/db";
import { setPlatformEnvSetting } from "@/modules/phone/core/db";
import { syncLiveProviderCatalog } from "./live-catalog";
import { ensureMigrated, loadRuntimeSettingsOnStartup } from "@/lib/db/migrate";
import type {
  AICapability,
  AIModelKind,
  GovernanceProviderId,
  PlatformAIProvider,
  PlatformAIRegistry,
  ProviderCredentialState,
  ProviderHealthRecord,
  ProviderModelRow,
} from "./types";

type Row = Record<string, unknown>;

const PROVIDER_IDS: GovernanceProviderId[] = ["openai", "gemini", "sarvam", "elevenlabs"];

export function isGovernanceProviderId(value: unknown): value is GovernanceProviderId {
  return typeof value === "string" && (PROVIDER_IDS as string[]).includes(value);
}

export function isAICapability(value: unknown): value is AICapability {
  return value === "chat" || value === "voice_chat" || value === "realtime_voice";
}

// ─── Registry cache ───────────────────────────────────────────────────────────
// The registry is read on every capability resolution and every admin
// workspace render. A 3-second TTL keeps it fresh enough for operator
// enable/disable switches while collapsing the 4-table join to one round trip
// on hot paths. Explicit invalidation happens on every mutation below.

const REGISTRY_TTL_MS = 3_000;
let registryCache: { expiresAt: number; value: PlatformAIRegistry } | null = null;

export function invalidateProviderRegistryCache(): void {
  registryCache = null;
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 6) return "••••••";
  return `••••••••${trimmed.slice(-3)}`;
}

function toHealthRecord(row: Row | null | undefined): ProviderHealthRecord | null {
  if (!row) return null;
  return {
    providerId: String(row.provider_id) as GovernanceProviderId,
    status: (["healthy", "degraded", "down", "unknown"] as const).includes(row.status as never)
      ? (row.status as ProviderHealthRecord["status"])
      : "unknown",
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
    checkedAt: row.checked_at == null ? null : String(row.checked_at),
    checkedBy: row.checked_by == null ? null : String(row.checked_by),
  };
}

function toModelRow(row: Row): ProviderModelRow {
  return {
    id: String(row.id),
    providerId: String(row.provider_id) as GovernanceProviderId,
    capability: String(row.capability) as AICapability,
    kind: String(row.kind) as AIModelKind,
    modelId: String(row.model_id),
    displayName: String(row.display_name ?? row.model_id),
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

/** Read the full platform provider registry (providers, capabilities, credential slots, health, model counts, defaults). */
export async function getPlatformAIRegistry(): Promise<PlatformAIRegistry> {
  // Runtime settings are DB-backed in production. Load them before resolving
  // configured state so Vercel functions do not mistake a saved API key for a
  // missing credential simply because the instance started without env values.
  await ensureMigrated();
  // Vercel serverless instances do not guarantee Node instrumentation runs before
  // every function invocation. Hydrate DB-backed platform secrets before deriving
  // credential state so registry.configured and toProviderConfig() observe the
  // same authoritative runtime credentials on every cold instance.
  await loadRuntimeSettingsOnStartup();
  const hit = registryCache;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const [providerRows, capabilityRows, credentialRows, healthRows, modelCountRows, defaultRows, defaultModelRows, embeddingDefaultRows] =
    await Promise.all([
      query<Row>("SELECT * FROM platform_ai_providers ORDER BY display_name"),
      query<Row>("SELECT provider_id, capability, supported FROM platform_ai_provider_capabilities"),
      query<Row>(
        `SELECT c.provider_id, c.env_key, c.base_url_env_key, c.masked_hint, c.configured, c.updated_at
           FROM platform_ai_provider_credentials c`,
      ),
      query<Row>(
        `SELECT DISTINCT ON (provider_id) provider_id, status, latency_ms, error_message, checked_by, checked_at
           FROM platform_ai_provider_health
          ORDER BY provider_id, checked_at DESC`,
      ),
      query<Row>(
        `SELECT provider_id, capability, count(*)::int AS model_count
           FROM platform_ai_provider_models
          WHERE enabled
            AND metadata->>'catalogSource' = 'vendor_live'
          GROUP BY provider_id, capability`,
      ),
      query<Row>("SELECT capability, provider_id, model_id FROM platform_ai_defaults"),
      query<Row>(
        `SELECT provider_id, capability, kind, model_id
           FROM platform_ai_provider_models
          WHERE enabled AND is_default
            AND metadata->>'catalogSource' = 'vendor_live'`,
      ),
      query<Row>(
        `SELECT provider_id, model_id, updated_at
           FROM platform_ai_embedding_defaults
          WHERE id = TRUE
          LIMIT 1`,
      ),
    ]);

  // Credential "configured" is resolved LIVE from process.env so the registry
  // reflects reality even before the credentials metadata row is refreshed.
  const credentialByProvider = new Map(credentialRows.map((r) => [String(r.provider_id), r]));
  const healthByProvider = new Map(healthRows.map((r) => [String(r.provider_id), r]));

  const realtimeEnabledRow = await queryOne<{ value: string }>(
    "SELECT value FROM platform_env_settings WHERE key = $1 LIMIT 1",
    ["ELEVENLABS_REALTIME_ENABLED"],
  );
  const elevenLabsRealtimeEnabled = (realtimeEnabledRow?.value ?? "").trim().toLowerCase() === "true";

  const providers: PlatformAIProvider[] = providerRows.map((p) => {
    const providerId = String(p.provider_id) as GovernanceProviderId;
    const credRow = credentialByProvider.get(providerId);
    const envKey = credRow ? String(credRow.env_key) : null;
    const baseUrlEnvKey = credRow?.base_url_env_key ? String(credRow.base_url_env_key) : null;
    const secretValue = envKey ? process.env[envKey]?.trim() : undefined;
    // Credential "configured" is resolved LIVE from process.env. The local
    // Qwen embeddings server needs no API key — its base URL being set is the
    // availability signal (QWEN_EMBEDDINGS_BASE_URL, or an explicit key).
    const configured =
      providerId === "qwen"
        ? Boolean(baseUrlEnvKey && process.env[baseUrlEnvKey]?.trim()) || Boolean(secretValue)
        : Boolean(secretValue);
    const credential: ProviderCredentialState | null = envKey
      ? {
          providerId,
          envKey,
          baseUrlEnvKey,
          maskedHint: secretValue ? maskSecret(secretValue) : null,
          configured,
          updatedAt: credRow?.updated_at == null ? null : String(credRow.updated_at),
        }
      : null;
    const modelCounts: PlatformAIProvider["modelCounts"] = {};
    for (const mc of modelCountRows) {
      if (String(mc.provider_id) !== providerId) continue;
      modelCounts[String(mc.capability) as AICapability] = Number(mc.model_count);
    }
    const rowEnabled = Boolean(p.enabled);
    return {
      providerId,
      displayName: String(p.display_name),
      description: typeof p.description === "string" ? p.description : null,
      enabled: rowEnabled,
      realtimeEnabled: providerId === "elevenlabs" ? elevenLabsRealtimeEnabled : false,
      disabledReason: null,
      configured,
      capabilities: capabilityRows
        .filter((c) => String(c.provider_id) === providerId)
        .map((c) => ({
          capability: String(c.capability) as AICapability,
          supported: Boolean(c.supported),
        })),
      health: toHealthRecord(healthByProvider.get(providerId)),
      monthlyBudgetUsd:
        p.monthly_budget_usd == null ? null : Number(p.monthly_budget_usd),
      warningThresholdPct: Number(p.warning_threshold_pct ?? 80),
      credential,
      modelCounts,
    };
  });

  const embeddingDefault = embeddingDefaultRows[0]
    ? {
        providerId: String(embeddingDefaultRows[0].provider_id) as "openai" | "gemini" | "qwen",
        modelId: String(embeddingDefaultRows[0].model_id),
        updatedAt: embeddingDefaultRows[0].updated_at == null ? null : String(embeddingDefaultRows[0].updated_at),
      }
    : null;

  const registry: PlatformAIRegistry = {
    providers,
    embeddingDefault,
    defaults: defaultRows.map((d) => ({
      capability: String(d.capability) as AICapability,
      providerId: d.provider_id == null ? null : String(d.provider_id),
      modelId: d.model_id == null ? null : String(d.model_id),
    })),
    defaultModels: defaultModelRows.map((m) => ({
      providerId: String(m.provider_id) as GovernanceProviderId,
      capability: String(m.capability) as AICapability,
      kind: String(m.kind) as AIModelKind,
      modelId: String(m.model_id),
    })),
  };

  registryCache = { expiresAt: Date.now() + REGISTRY_TTL_MS, value: registry };
  return registry;
}

/** Single provider view with its model catalogue (admin detail workspace). */
export async function getProviderWorkspace(providerId: GovernanceProviderId): Promise<{
  provider: PlatformAIProvider;
  models: ProviderModelRow[];
} | null> {
  // Keep admin and runtime consumers on the same live catalogue.
  await syncLiveProviderCatalog();
  const registry = await getPlatformAIRegistry();
  const provider = registry.providers.find((p) => p.providerId === providerId);
  if (!provider) return null;
  const rows = await query<Row>(
    `SELECT * FROM platform_ai_provider_models
      WHERE provider_id = $1
        AND metadata->>'catalogSource' = 'vendor_live'
      ORDER BY capability, kind,
        CASE WHEN jsonb_typeof(metadata->'inputUsdPerMTokens') = 'number'
          THEN (metadata->>'inputUsdPerMTokens')::numeric END ASC NULLS LAST,
        CASE WHEN jsonb_typeof(metadata->'usdPer1kChars') = 'number'
          THEN (metadata->>'usdPer1kChars')::numeric END ASC NULLS LAST,
        CASE WHEN metadata->>'releaseDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          THEN (metadata->>'releaseDate')::date END DESC NULLS LAST,
        display_name ASC`,
    [providerId],
  );
  return { provider, models: rows.map(toModelRow) };
}

export async function listProviderModels(
  providerId: GovernanceProviderId,
  capability?: AICapability,
): Promise<ProviderModelRow[]> {
  // Runtime never waits for network when a successful live catalogue is cached.
  // On a cold start, however, wait for the first discovery if this provider /
  // capability has no live rows, so the first session does not fail needlessly.
  void syncLiveProviderCatalog();
  const loadRows = () => capability
    ? query<Row>(
        `SELECT * FROM platform_ai_provider_models WHERE provider_id = $1 AND capability = $2
          ORDER BY
            kind,
            CASE WHEN jsonb_typeof(metadata->'inputUsdPerMTokens') = 'number'
              THEN (metadata->>'inputUsdPerMTokens')::numeric END ASC NULLS LAST,
            CASE WHEN jsonb_typeof(metadata->'usdPer1kChars') = 'number'
              THEN (metadata->>'usdPer1kChars')::numeric END ASC NULLS LAST,
            CASE WHEN metadata->>'releaseDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (metadata->>'releaseDate')::date END DESC NULLS LAST,
            display_name ASC`,
        [providerId, capability],
      )
    : query<Row>(
        `SELECT * FROM platform_ai_provider_models WHERE provider_id = $1
          ORDER BY capability, kind,
            CASE WHEN jsonb_typeof(metadata->'inputUsdPerMTokens') = 'number'
              THEN (metadata->>'inputUsdPerMTokens')::numeric END ASC NULLS LAST,
            CASE WHEN jsonb_typeof(metadata->'usdPer1kChars') = 'number'
              THEN (metadata->>'usdPer1kChars')::numeric END ASC NULLS LAST,
            CASE WHEN metadata->>'releaseDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN (metadata->>'releaseDate')::date END DESC NULLS LAST,
            display_name ASC`,
        [providerId],
      );
  let rows = await loadRows();
  if (!rows.some((row) => (row.metadata as Record<string, unknown> | null)?.catalogSource === "vendor_live")) {
    await syncLiveProviderCatalog();
    rows = await loadRows();
  }
  return rows.map(toModelRow);
}

// ─── Mutations (platform admin only — enforced at the API layer) ──────────────

export async function setProviderEnabled(
  providerId: GovernanceProviderId,
  enabled: boolean,
  updatedBy?: string | null,
): Promise<void> {
  await execute(
    "UPDATE platform_ai_providers SET enabled = $2, updated_at = now() WHERE provider_id = $1",
    [providerId, enabled],
  );
  invalidateProviderRegistryCache();
}

export async function setProviderGovernance(
  providerId: GovernanceProviderId,
  input: { monthlyBudgetUsd?: number | null; warningThresholdPct?: number },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.monthlyBudgetUsd !== undefined) {
    params.push(input.monthlyBudgetUsd);
    sets.push(`monthly_budget_usd = $${params.length}`);
  }
  if (input.warningThresholdPct !== undefined) {
    params.push(input.warningThresholdPct);
    sets.push(`warning_threshold_pct = $${params.length}`);
  }
  if (sets.length === 0) return;
  params.push(providerId);
  await execute(
    `UPDATE platform_ai_providers SET ${sets.join(", ")}, updated_at = now() WHERE provider_id = $${params.length}`,
    params,
  );
  invalidateProviderRegistryCache();
}

/**
 * Update a provider credential. The secret value goes to platform_env_settings
 * (the existing server-side secret mechanism, mirrored into process.env);
 * only the masked hint + audit metadata are stored in the registry.
 */
export async function updateProviderCredential(
  providerId: GovernanceProviderId,
  input: { apiKey?: string | null; baseUrl?: string | null },
  updatedBy: string | null,
): Promise<ProviderCredentialState | null> {
  const credRow = await queryOne<Row>(
    "SELECT * FROM platform_ai_provider_credentials WHERE provider_id = $1",
    [providerId],
  );
  if (!credRow) return null;
  const envKey = String(credRow.env_key);
  const baseUrlEnvKey = credRow.base_url_env_key ? String(credRow.base_url_env_key) : null;

  let maskedHint: string | null = null;
  if (input.apiKey !== undefined && input.apiKey !== null) {
    const trimmed = input.apiKey.trim();
    if (trimmed) {
      await setPlatformEnvSetting(envKey, trimmed, updatedBy);
      process.env[envKey] = trimmed;
      maskedHint = maskSecret(trimmed);
    } else {
      // Empty value = clear the credential.
      await setPlatformEnvSetting(envKey, "", updatedBy);
      delete process.env[envKey];
      maskedHint = null;
    }
  }
  if (baseUrlEnvKey && input.baseUrl !== undefined && input.baseUrl !== null) {
    const trimmed = input.baseUrl.trim();
    await setPlatformEnvSetting(baseUrlEnvKey, trimmed, updatedBy);
    process.env[baseUrlEnvKey] = trimmed;
  }

  const effectiveSecret = process.env[envKey]?.trim() ?? "";
  const row = await queryOne<Row>(
    `UPDATE platform_ai_provider_credentials
        SET masked_hint = $2, configured = $3, updated_by = $4, updated_at = now()
      WHERE provider_id = $1
      RETURNING provider_id, env_key, base_url_env_key, masked_hint, configured, updated_at`,
    [providerId, maskedHint ?? (maskSecret(effectiveSecret) || null), Boolean(effectiveSecret), updatedBy],
  );
  invalidateProviderRegistryCache();
  if (!row) return null;
  return {
    providerId,
    envKey: String(row.env_key),
    baseUrlEnvKey: row.base_url_env_key ? String(row.base_url_env_key) : null,
    maskedHint: row.masked_hint ? String(row.masked_hint) : null,
    configured: Boolean(row.configured),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function setModelEnabled(
  providerId: GovernanceProviderId,
  capability: AICapability,
  kind: AIModelKind,
  modelId: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE platform_ai_provider_models
        SET enabled = $5, updated_at = now()
      WHERE provider_id = $1 AND capability = $2 AND kind = $3 AND model_id = $4
      RETURNING id`,
    [providerId, capability, kind, modelId, enabled],
  );
  invalidateProviderRegistryCache();
  return rows.length > 0;
}

/**
 * Set the platform default model for a (provider, capability, kind) slot.
 * Exactly one default per slot — clears siblings first.
 */
export async function setModelDefault(
  providerId: GovernanceProviderId,
  capability: AICapability,
  kind: AIModelKind,
  modelId: string,
): Promise<boolean> {
  const exists = await queryOne<{ id: string }>(
    `SELECT id FROM platform_ai_provider_models
      WHERE provider_id = $1 AND capability = $2 AND kind = $3 AND model_id = $4`,
    [providerId, capability, kind, modelId],
  );
  if (!exists) return false;
  await execute(
    `UPDATE platform_ai_provider_models
        SET is_default = (model_id = $4), updated_at = now()
      WHERE provider_id = $1 AND capability = $2 AND kind = $3`,
    [providerId, capability, kind, modelId],
  );
  invalidateProviderRegistryCache();
  return true;
}

/** Set the platform default provider (+ optional model) for a capability. */
export async function setEmbeddingDefault(
  providerId: "openai" | "gemini" | "qwen",
  modelId: string,
  updatedBy: string | null,
): Promise<void> {
  const model = await queryOne<Row>(
    `SELECT id FROM platform_ai_provider_models
      WHERE provider_id = $1 AND capability = 'chat' AND kind = 'embedding'
        AND model_id = $2 AND enabled = TRUE`,
    [providerId, modelId],
  );
  if (!model) throw new Error("Embedding model is not available or enabled for this provider.");

  await execute(
    `INSERT INTO platform_ai_embedding_defaults (id, provider_id, model_id, updated_by, updated_at)
     VALUES (TRUE, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET provider_id = $1, model_id = $2, updated_by = $3, updated_at = now()`,
    [providerId, modelId, updatedBy],
  );
  invalidateProviderRegistryCache();
}

export async function setCapabilityDefault(
  capability: AICapability,
  providerId: string | null,
  modelId: string | null,
  updatedBy: string | null,
): Promise<void> {
  await execute(
    `INSERT INTO platform_ai_defaults (capability, provider_id, model_id, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (capability) DO UPDATE
       SET provider_id = $2, model_id = $3, updated_by = $4, updated_at = now()`,
    [capability, providerId, modelId, updatedBy],
  );
  invalidateProviderRegistryCache();
}

// ─── Health records ───────────────────────────────────────────────────────────

export async function recordProviderHealth(
  providerId: GovernanceProviderId,
  result: { status: "healthy" | "degraded" | "down"; latencyMs: number | null; errorMessage: string | null },
  checkedBy: string | null,
): Promise<ProviderHealthRecord> {
  const id = randomUUID();
  // checked_by is UUID REFERENCES users(id) ON DELETE SET NULL. A non-UUID
  // actor label (e.g. a cron name) made Postgres reject the whole INSERT with
  // "invalid input syntax for type uuid", which took the ai-health cron — and
  // with it every incident capture — down for as long as it ran. Coerce any
  // non-UUID value to NULL instead of failing the health write.
  const safeCheckedBy =
    checkedBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkedBy.trim())
      ? checkedBy.trim()
      : null;
  const row = await queryOne<Row>(
    `INSERT INTO platform_ai_provider_health (id, provider_id, status, latency_ms, error_message, checked_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING provider_id, status, latency_ms, error_message, checked_by, checked_at`,
    [id, providerId, result.status, result.latencyMs, result.errorMessage, safeCheckedBy],
  );
  invalidateProviderRegistryCache();
  return {
    providerId,
    status: result.status,
    latencyMs: result.latencyMs,
    errorMessage: result.errorMessage,
    checkedAt: row?.checked_at ? String(row.checked_at) : new Date().toISOString(),
    checkedBy: safeCheckedBy,
  };
}

export async function getLatestProviderHealth(
  providerId: GovernanceProviderId,
): Promise<ProviderHealthRecord | null> {
  const row = await queryOne<Row>(
    `SELECT provider_id, status, latency_ms, error_message, checked_by, checked_at
       FROM platform_ai_provider_health
      WHERE provider_id = $1
      ORDER BY checked_at DESC
      LIMIT 1`,
    [providerId],
  );
  return toHealthRecord(row);
}

export async function listProviderHealthHistory(
  providerId: GovernanceProviderId,
  limit = 20,
): Promise<ProviderHealthRecord[]> {
  const rows = await query<Row>(
    `SELECT provider_id, status, latency_ms, error_message, checked_by, checked_at
       FROM platform_ai_provider_health
      WHERE provider_id = $1
      ORDER BY checked_at DESC
      LIMIT $2`,
    [providerId, limit],
  );
  return rows.map((r) => toHealthRecord(r)!).filter(Boolean);
}
