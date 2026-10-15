/**
 * src/lib/env-scope.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One deployment, two environments (development + production), the SAME
 * infrastructure servers — isolation driven purely by environment variables.
 *
 * The model (full guide: docs/deployment/environments.md):
 *
 *   CLARA_ENV=development            CLARA_ENV=production (default)
 *   ────────────────────────────     ─────────────────────────────────
 *   Postgres   schema clara_dev      schema unchanged (public)
 *   Qdrant     collections dev_*     collections unprefixed
 *   Redis      REDIS_URL /db index   db 0 (or any index via REDIS_URL)
 *   BullMQ     prefix dev_ (opt.)    no prefix
 *   RabbitMQ   vhost clara_dev       vhost / (via RABBITMQ_URL)
 *
 * Backward compatibility is absolute: with CLARA_ENV unset (or =production)
 * every knob resolves to today's behaviour — an existing deployment sees no
 * difference after upgrading. Only opting into CLARA_ENV=development (or
 * setting an explicit PG_SCHEMA / QDRANT_COLLECTION_PREFIX / BULLMQ_PREFIX)
 * activates scoping.
 *
 * Why schemas for Postgres and not a second database: the requirement is
 * "same connections but different environments". One DATABASE_URL, one role,
 * one pooler — the env schema rides the identical connection via
 * search_path, and migrations create it on first boot.
 */

export type ClaraEnv = "development" | "production";

const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/i;
const COLLECTION_PREFIX_PATTERN = /^[a-z0-9_-]{0,32}$/i;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Like readEnv, but an EXPLICITLY-set empty value is preserved (opt-out). */
function readRawEnv(name: string): string | undefined {
  return process.env[name] === undefined ? undefined : process.env[name]!.trim();
}

/** development | production. NODE_ENV seeds it; CLARA_ENV wins. */
export function resolveClaraEnv(): ClaraEnv {
  const explicit = readEnv("CLARA_ENV")?.toLowerCase();
  if (explicit === "development" || explicit === "production") return explicit;
  return process.env.NODE_ENV === "development" ? "development" : "production";
}

/**
 * Postgres schema for THIS environment.
 *   PG_SCHEMA            → explicit override (e.g. clara_prod to move prod off public)
 *   CLARA_ENV=development → clara_dev
 *   otherwise            → null (public — today's behaviour)
 */
export function resolvePgSchema(): string | null {
  const explicit = readEnv("PG_SCHEMA");
  if (explicit) {
    if (!SCHEMA_NAME_PATTERN.test(explicit)) {
      throw new Error(
        `[env-scope] PG_SCHEMA "${explicit}" is not a safe schema identifier ` +
          `(letters, digits, underscores; must not start with a digit).`,
      );
    }
    return explicit.toLowerCase();
  }
  return resolveClaraEnv() === "development" ? "clara_dev" : null;
}

/**
 * Prefix for NEW Qdrant collection names (existing collections keep the name
 * stored in Postgres — names are generated once at KB creation).
 *   QDRANT_COLLECTION_PREFIX   → explicit override ("" disables dev scoping)
 *   CLARA_ENV=development      → dev_
 *   otherwise                  → "" (unprefixed)
 */
export function resolveQdrantCollectionPrefix(): string {
  const explicit = readRawEnv("QDRANT_COLLECTION_PREFIX");
  if (explicit != null) {
    if (!COLLECTION_PREFIX_PATTERN.test(explicit)) {
      throw new Error(
        `[env-scope] QDRANT_COLLECTION_PREFIX "${explicit}" must be 0–32 chars of [a-z0-9_-].`,
      );
    }
    return explicit;
  }
  return resolveClaraEnv() === "development" ? "dev_" : "";
}

/**
 * BullMQ key prefix (optional). Prefer the REDIS_URL db index for isolation —
 * it is free and total. Set BULLMQ_PREFIX only when SELECT is unavailable
 * (Redis Cluster / ElastiCache), where key prefixes are the only separation.
 *   BULLMQ_PREFIX               → explicit override ("" disables)
 *   CLARA_ENV=development       → dev_ (so a shared-db-0 cluster still splits)
 *   otherwise                   → null (no prefix — today's behaviour)
 *
 * NOTE: changing the prefix strands in-flight jobs (BullMQ keys move), so
 * production never gets a default prefix; only development opts in.
 */
export function resolveBullmqPrefix(): string | null {
  const explicit = readRawEnv("BULLMQ_PREFIX");
  if (explicit != null) {
    if (!COLLECTION_PREFIX_PATTERN.test(explicit)) {
      throw new Error(
        `[env-scope] BULLMQ_PREFIX "${explicit}" must be 0–32 chars of [a-z0-9_-].`,
      );
    }
    return explicit || null;
  }
  return resolveClaraEnv() === "development" ? "dev_" : null;
}

/** Applied to a generated Qdrant collection base name. */
export function applyQdrantCollectionPrefix(baseName: string): string {
  return `${resolveQdrantCollectionPrefix()}${baseName}`;
}

/**
 * Human-readable scope line for startup logs — one glance tells the operator
 * which environment this process is wired to.
 */
export function describeEnvScope(): string {
  const parts: string[] = [`env=${resolveClaraEnv()}`];
  const schema = resolvePgSchema();
  if (schema) parts.push(`pgSchema=${schema}`);
  const qdrantPrefix = resolveQdrantCollectionPrefix();
  if (qdrantPrefix) parts.push(`qdrantPrefix=${qdrantPrefix}`);
  const bullmq = resolveBullmqPrefix();
  if (bullmq) parts.push(`bullmqPrefix=${bullmq}`);
  return parts.join(" ");
}
