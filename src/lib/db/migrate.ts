import fs from "fs";
import path from "path";
import { pool } from "@/lib/db";
import type { PoolClient } from "pg";
import { findDuplicateMigrationNumbers } from "@/lib/db/migration-validation";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");
const MIGRATION_LOCK_KEY = "clara-schema-migrations";

async function createMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
}

async function appliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename",
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function runMigrations(): Promise<void> {
  // Validate the complete migration set before opening a DB connection. This
  // makes a duplicate-number failure deterministic and prevents even bootstrap
  // schema queries from running against an invalid migration set.
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const duplicates = findDuplicateMigrationNumbers(files);
  if (duplicates.length > 0) {
    throw new Error(`[migrate] duplicate migration numbers detected: ${duplicates.join(", ")}`);
  }

  // Vercel can start multiple serverless instances at the same time. The
  // advisory lock serializes schema changes across instances.
  //
  // IMPORTANT: the lock client must also execute the migration queries.
  // Vercel uses PG_POOL_MAX=1 by default, so acquiring one client and then
  // calling pool.query()/pool.connect() again would wait forever for a second
  // connection and surface as "timeout exceeded when trying to connect".
  const lockClient = await pool.connect();

  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);

    await createMigrationsTable(lockClient);
    const applied = await appliedMigrations(lockClient);

    let appliedCount = 0;
    for (const filename of files) {
      if (applied.has(filename)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8");
      try {
        await lockClient.query("BEGIN");
        await lockClient.query(sql);
        await lockClient.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await lockClient.query("COMMIT");
        console.log(`[migrate] applied ${filename}`);
        appliedCount++;
      } catch (err) {
        await lockClient.query("ROLLBACK");
        console.error(`[migrate] FAILED on required schema migration ${filename}:`, err);
        throw err;
      }
    }

    if (appliedCount === 0) console.log("[migrate] All migrations already applied.");
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    } finally {
      lockClient.release();
    }
  }
}

/**
 * Load DB-backed runtime settings into process.env.
 *
 * Migrations only seed a neutral key catalogue; any value actually stored in
 * the DB is authoritative (it was written by an admin or the production seed),
 * so it intentionally overrides process.env here.
 */
async function loadRuntimeSettings(): Promise<boolean> {
  try {
    const result = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM platform_env_settings WHERE value IS NOT NULL AND value <> ''",
    );
    for (const row of result.rows) process.env[row.key] = row.value;
    return true;
  } catch (err) {
    console.warn("[migrate] runtime settings could not be loaded:", (err as Error).message);
    return false;
  }
}

/**
 * Request-path refresh of the DB-backed runtime settings. The provider
 * registry calls this on every AI resolution, so without a throttle every
 * voice/chat turn re-read the whole settings table (on a single-connection
 * serverless pool, in front of every other query). Saving a setting updates
 * the saving instance immediately (setPlatformEnvSetting); other instances
 * pick it up within RUNTIME_SETTINGS_REFRESH_MS (default 30 s).
 */
const RUNTIME_SETTINGS_REFRESH_MS = (() => {
  const value = Number(process.env.RUNTIME_SETTINGS_REFRESH_MS);
  return Number.isFinite(value) && value >= 0 ? value : 30_000;
})();
let runtimeSettingsLoadedAt = 0;
let runtimeSettingsInFlight: Promise<void> | null = null;

export async function runMigrationsOnStartup(): Promise<void> {
  await runMigrations();
  if (await loadRuntimeSettings()) runtimeSettingsLoadedAt = Date.now();
}

/** Compatibility name used by the Node instrumentation bootstrap. */
export async function loadRuntimeSettingsOnStartup(): Promise<void> {
  // Migrations run in the deployment build. Do not acquire an advisory lock
  // from every Vercel cold start; only load the DB-backed runtime settings.
  if (Date.now() - runtimeSettingsLoadedAt < RUNTIME_SETTINGS_REFRESH_MS) return;
  if (!runtimeSettingsInFlight) {
    runtimeSettingsInFlight = loadRuntimeSettings()
      .then((ok) => { if (ok) runtimeSettingsLoadedAt = Date.now(); })
      .finally(() => { runtimeSettingsInFlight = null; });
  }
  await runtimeSettingsInFlight;
}

/**
 * Request-path migration guard.
 *
 * Schema migrations MUST NOT run from an HTTP request on serverless runtimes.
 * Production schema changes are applied during deployment/startup via
 * runMigrationsOnStartup(). Keeping this function as a compatibility no-op
 * lets existing handlers be migrated incrementally without reintroducing a
 * database migration into every cold-start/request path.
 */
export async function ensureMigrated(): Promise<void> {
  return;
}
