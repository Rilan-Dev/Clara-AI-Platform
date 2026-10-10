/* Inspect live platform_env_settings SARVAM rows (production DB). */
const fs = require("fs");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

const c = new Client({ connectionString: url });
(async () => {
  await c.connect();
  const r = await c.query(
    "select key, CASE WHEN is_secret THEN '***(' || length(coalesce(value,'')) || ' chars)' ELSE coalesce(value,'(null)') END as value, updated_at from platform_env_settings where key like 'SARVAM%' order by key"
  );
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
