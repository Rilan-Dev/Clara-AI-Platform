/**
 * src/lib/db/migrate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight migration runner.
 *
 * Two entry points:
 *
 *  1. runMigrationsOnStartup() — called once from src/instrumentation.ts at
 *     server boot. Runs ALL pending migrations. Schema migrations (001-006)
 *     throw on failure. Seed migrations (007+) warn and skip if data isn't
 *     ready yet (e.g. orgs not seeded yet).
 *
 *  2. ensureMigrated() — legacy lazy guard called per-route. No-ops after
 *     startup has already run migrations.
 */

import fs from "fs";
import path from "path";
import { pool } from "@/lib/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");

// Migrations at or above this prefix are best-effort seed migrations.
const SEED_THRESHOLD = "007";

// Process-level flag so ensureMigrated() is a cheap no-op after startup.
let migrated = false;

// ── Internal helpers ──────────────────────────────────────────────────────────

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
    .sort();

  let appliedCount = 0;

  for (const filename of files) {
    if (applied.has(filename)) continue;

    const isSeed = filename >= SEED_THRESHOLD;
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
      appliedCount++;
    } catch (err) {
      await client.query("ROLLBACK");
      if (isSeed) {
        // Seed migrations may fail on a fresh DB before `npm run seed` is run.
        // Log a warning and skip — will be retried on next restart.
        console.warn(
          `[migrate] skipped seed migration ${filename} (run "npm run seed" to populate demo data):`,
          (err as Error).message
        );
      } else {
        console.error(`[migrate] FAILED on ${filename}:`, err);
        throw err;
      }
    } finally {
      client.release();
    }
  }

  if (appliedCount === 0) {
    console.log("[migrate] All migrations already applied.");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called from src/instrumentation.ts at server startup.
 * Runs all pending migrations before the first request is served.
 */
export async function runMigrationsOnStartup(): Promise<void> {
  await runMigrations();
  migrated = true;
}

/**
 * Called per-route as a lazy guard. After startup has run, this is a no-op.
 * Kept for safety so routes still work even if instrumentation is disabled.
 */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  await runMigrations();
  migrated = true;
}
