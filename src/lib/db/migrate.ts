import fs from "fs";
import path from "path";
import { pool } from "@/lib/db";
import type { PoolClient } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");
const MIGRATION_LOCK_KEY = "clara-schema-migrations";

let migrated = false;
let migrationPromise: Promise<void> | null = null;

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

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // Guard: each migration file number must be unique — duplicates indicate
    // an accidental re-add and must never be executed.
    const numbers = files.map((f) => f.split("_")[0]);
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    if (dupes.length > 0) {
      throw new Error(`[migrate] duplicate migration numbers detected: ${dupes.join(", ")}`);
    }

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
async function loadRuntimeSettings(): Promise<void> {
  try {
    const result = await pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM platform_env_settings WHERE value IS NOT NULL AND value <> ''",
    );
    for (const row of result.rows) process.env[row.key] = row.value;
  } catch (err) {
    console.warn("[migrate] runtime settings could not be loaded:", (err as Error).message);
  }
}

export async function runMigrationsOnStartup(): Promise<void> {
  await runMigrations();
  await loadRuntimeSettings();
  migrated = true;
}

export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    await runMigrations();
    await loadRuntimeSettings();
    migrated = true;
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });

  return migrationPromise;
}
