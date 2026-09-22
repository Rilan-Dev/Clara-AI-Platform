import fs from "fs";
import path from "path";
import { pool } from "@/lib/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");
const MIGRATION_LOCK_KEY = "clara-schema-migrations";

let migrated = false;

async function createMigrationsTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations ORDER BY filename");
  return new Set(result.rows.map((r) => r.filename));
}

async function runMigrations(): Promise<void> {
  // Vercel can start multiple serverless instances at the same time. Without a
  // database-level lock, two instances can both observe a missing migration
  // and execute CREATE TABLE concurrently, producing duplicate pg_type errors.
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);

    await createMigrationsTable();
    const applied = await appliedMigrations();

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // Guard: each migration file number must be unique — the baseline is
    // strictly sequential, duplicates would indicate an accidental re-add.
    const numbers = files.map((f) => f.split("_")[0]);
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    if (dupes.length > 0) {
      throw new Error(`[migrate] duplicate migration numbers detected: ${dupes.join(", ")}`);
    }

    let appliedCount = 0;
    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log(`[migrate] applied ${filename}`);
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] FAILED on required schema migration ${filename}:`, err);
        throw err;
      } finally {
        client.release();
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
  await runMigrations();
  await loadRuntimeSettings();
  migrated = true;
}
