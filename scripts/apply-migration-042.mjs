import fs from "node:fs";
import { Client } from "pg";
const envText = fs.readFileSync(".env", "utf8");
const pgUrl = envText.split("\n").map(l => l.trim()).find(l => l.startsWith("DATABASE_URL="))?.slice("DATABASE_URL=".length);
const client = new Client({ connectionString: pgUrl });
const sql = fs.readFileSync("src/lib/db/migrations/042_default_assistant_behaviour_branding.sql", "utf8");
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("INSERT INTO schema_migrations (filename) VALUES ('042_default_assistant_behaviour_branding.sql')");
  await client.query("COMMIT");
  console.log("migration 042 applied");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
