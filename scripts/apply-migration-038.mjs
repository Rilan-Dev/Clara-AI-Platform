/**
 * scripts/apply-migration-038.mjs
 * One-off: apply 038_realtime_voice_provider.sql to the shared remote DB,
 * mirroring migrate.ts ledger mechanics (record in schema_migrations, verify
 * post-state, idempotent re-run). Run: node scripts/apply-migration-038.mjs
 *
 * NOTE: loads DATABASE_URL from the repo .env explicitly — the sandbox
 * exports a shadowing DATABASE_URL env var that points elsewhere.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, "..", "src", "lib", "db", "migrations", "038_realtime_voice_provider.sql");
const sql = readFileSync(sqlPath, "utf8");

const envPath = join(here, "..", ".env");
const envText = readFileSync(envPath, "utf8");
const envUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const connectionString = envUrl ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required (from .env or environment)");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();

  // Ledger up-front check (idempotency)
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows: ledger } = await client.query(`SELECT filename FROM schema_migrations WHERE filename = '038_realtime_voice_provider.sql'`);
  if (ledger.length > 0) {
    console.log("038 already applied (ledger) — verifying post-state only.");
  } else {
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ('038_realtime_voice_provider.sql')`);
      await client.query("COMMIT");
      console.log("✅ applied 038_realtime_voice_provider.sql + ledgered");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ migration failed:", err.message);
      process.exit(1);
    }
  }

  // Post-state assertions
  for (const table of ["org_ai_settings", "agent_ai_settings", "kb_ai_overrides"]) {
    const { rows: col } = await client.query(`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_name = $1 AND column_name = 'realtime_voice_provider'
    `, [table]);
    if (col.length === 0) throw new Error(`${table}.realtime_voice_provider missing after apply`);
    console.log(`✅ ${table}.realtime_voice_provider present`);
  }

  const { rows: orgs } = await client.query(`SELECT count(*)::int AS n FROM org_ai_settings WHERE realtime_voice_provider IS NOT NULL`);
  console.log(`✅ orgs with an explicit realtime override: ${orgs[0].n} (expected 0 — dark launch)`);

  await client.end();
}

main().catch((err) => {
  console.error("❌ apply-migration-038 failed:", err.message);
  process.exit(1);
});
