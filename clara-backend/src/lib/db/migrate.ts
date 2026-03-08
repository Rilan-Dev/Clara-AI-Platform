/**
 * src/lib/db/migrate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight migration runner.
 *
 * Strategy:
 *  1. On first call, create a `schema_migrations` table if it doesn't exist.
 *  2. Read every *.sql file from src/lib/db/migrations/ in alphabetical order.
 *  3. For each file not yet recorded in schema_migrations, execute it inside a
 *     transaction and record it. Already-applied migrations are skipped.
 *
 * Usage: call runMigrations() once at server startup, or lazily via
 * ensureMigrated() which caches the result so it only runs once per process.
 *
 *   import { ensureMigrated } from "@/lib/db/migrate";
 *   await ensureMigrated();   // idempotent — safe to call on every request
 */

import fs from "node:fs";
import path from "node:path";

import { pool } from "@/lib/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");

let migrated = false; // process-level cache

async function createMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function runMigrations(): Promise<void> {
  await createMigrationsTable();
  const applied = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // alphabetical = chronological given 001_, 002_ prefix

  for (const filename of files) {
    if (applied.has(filename)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [filename]
      );
      await client.query("COMMIT");
      console.log(`[migrate] applied ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[migrate] FAILED on ${filename}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Call this at the top of every API handler that touches the new tables.
 *  Runs the migrations only once per process lifetime. */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  await runMigrations();
  migrated = true;
}
