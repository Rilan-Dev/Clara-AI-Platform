/**
 * Read-only probe of the remote Clara database:
 * - connectivity + version
 * - applied migrations (schema_migrations)
 * - counts of core tables
 * - whether RabbitMQ outbox migration 025 is applied
 * Loads DATABASE_URL from the repo .env — no credentials hardcoded.
 */
import { readFileSync } from "node:fs";
import pg from "/home/z/my-project/Clara-AI-Platform/node_modules/pg/lib/index.js";
const { Client } = pg;

const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!dbUrl) { console.error("DATABASE_URL not found in .env"); process.exit(1); }

const client = new Client({ connectionString: dbUrl });
await client.connect();

const version = (await client.query("select version()")).rows[0].version;
console.log("PG VERSION:", version.split(",")[0]);

const mig = await client.query(
  "select filename from schema_migrations order by filename"
);
console.log("\nAPPLIED MIGRATIONS (" + mig.rows.length + "):");
for (const r of mig.rows) console.log("  ", r.filename);

console.log("\nOUTBOX 025 APPLIED:", mig.rows.some(r => r.filename.startsWith("025")));

// core table counts (read-only)
const tables = ["organisations", "users", "subscription_plans", "org_subscriptions", "event_outbox", "knowledge_bases", "documents", "query_events", "audit_logs"];
console.log("\nTABLE COUNTS:");
for (const t of tables) {
  try {
    const c = await client.query(`select count(*)::int as n from ${t}`);
    console.log("  ", t.padEnd(24), c.rows[0].n);
  } catch (e) {
    console.log("  ", t.padEnd(24), "MISSING/ERROR:", e.message.slice(0, 60));
  }
}

// pending migrations vs local files
const { readdirSync } = await import("node:fs");
const local = readdirSync("/home/z/my-project/Clara-AI-Platform/src/lib/db/migrations").filter(f => f.endsWith(".sql"));
const applied = new Set(mig.rows.map(r => r.filename));
const pending = local.filter(f => !applied.has(f));
console.log("\nPENDING MIGRATIONS:", pending.length ? pending : "none — DB is up to date");

await client.end();
