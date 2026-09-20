/**
 * scripts/apply-migration-037.mjs
 * One-off: apply 037_phone_elevenlabs_engine.sql to the shared remote DB,
 * mirroring migrate.ts ledger mechanics (record in schema_migrations, verify
 * post-state, idempotent re-run). Run: node scripts/apply-migration-037.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, "..", "src", "lib", "db", "migrations", "037_phone_elevenlabs_engine.sql");
const sql = readFileSync(sqlPath, "utf8");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();

  // Ledger up-front check (idempotency)
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows: ledger } = await client.query(`SELECT filename FROM schema_migrations WHERE filename = '037_phone_elevenlabs_engine.sql'`);
  if (ledger.length > 0) {
    console.log("037 already applied (ledger) — verifying post-state only.");
  } else {
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ('037_phone_elevenlabs_engine.sql')`);
      await client.query("COMMIT");
      console.log("✅ applied 037_phone_elevenlabs_engine.sql + ledgered");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ migration failed:", err.message);
      process.exit(1);
    }
  }

  // Post-state assertions
  const { rows: col } = await client.query(`
    SELECT column_name, data_type, column_default, character_maximum_length
      FROM information_schema.columns
     WHERE table_name = 'phone_call_configs' AND column_name = 'voice_engine'
  `);
  if (col.length === 0) throw new Error("voice_engine column missing after apply");
  console.log("✅ phone_call_configs.voice_engine present:", col[0].data_type, col[0].column_default);

  const { rows: configs } = await client.query(`SELECT voice_engine, count(*)::int AS n FROM phone_call_configs GROUP BY 1`);
  console.log("✅ existing configs by engine:", JSON.stringify(configs));

  await client.end();
}

main().catch(async (err) => {
  console.error("FAILED:", err.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
