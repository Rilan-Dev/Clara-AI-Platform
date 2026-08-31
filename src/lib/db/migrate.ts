/**
 * src/lib/db/migrate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight migration runner.
 *
 * Two entry points:
 *
 *  1. runMigrationsOnStartup() — called once from src/instrumentation.ts at
 *     server boot. Runs ALL pending migrations. Schema migrations fail fast.
 *     Data/demo seed migrations may warn and retry on the next restart.
 *
 *  2. ensureMigrated() — legacy lazy guard called per-route. No-ops after
 *     startup has already run migrations.
 */

import fs from "fs";
import path from "path";
import { pool } from "@/lib/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");

// Only migrations that are explicitly data/demo seeds are best-effort. Schema
// migrations such as 009_org_ai_settings and 011_project_ai_catalog must fail
// fast; silently skipping them can leave a running application without tables
// that its application code requires.
const SEED_MIGRATION_PATTERNS = [
  /^007_seed_/,
  /^021_demo_/,
  /^025_demo_/,
  /^026_demo_/,
  /^027_demo_/,
];

function isSeedMigration(filename: string): boolean {
  return SEED_MIGRATION_PATTERNS.some((pattern) => pattern.test(filename));
}

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

    const isSeed = isSeedMigration(filename);
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
        // Seed migrations may depend on data being populated separately. They
        // are retried on the next restart and must not prevent schema startup.
        console.warn(
          `[migrate] skipped seed migration ${filename} (will retry on next restart):`,
          (err as Error).message
        );
      } else {
        console.error(`[migrate] FAILED on required schema migration ${filename}:`, err);
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
