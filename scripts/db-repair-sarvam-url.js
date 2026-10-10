/* Repair the poisoned production DB row: SARVAM_BASE_URL was blanked by a
 * platform-settings panel save on 2026-09-19 18:42:55 UTC. Restore the
 * migration-036 seeded default. Idempotent — only touches the empty row. */
const fs = require("fs");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

const c = new Client({ connectionString: url });
(async () => {
  await c.connect();
  const r = await c.query(
    "UPDATE platform_env_settings SET value = 'https://api.sarvam.ai', updated_at = now() " +
    "WHERE key = 'SARVAM_BASE_URL' AND value = '' RETURNING key, value"
  );
  console.log("rows repaired:", r.rowCount, JSON.stringify(r.rows));
  const check = await c.query("select key, value from platform_env_settings where key = 'SARVAM_BASE_URL'");
  console.log("current:", JSON.stringify(check.rows));
  await c.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
