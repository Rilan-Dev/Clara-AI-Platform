/* Resolve the landing embed key's KB mapping via the same sha256 the app uses. */
const fs = require("fs");
const crypto = require("crypto");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];
const c = new Client({ connectionString: url });

(async () => {
  await c.connect();
  const lk = await c.query(
    "SELECT value FROM platform_env_settings WHERE key = 'NEXT_PUBLIC_LANDING_EMBED_API_KEY'"
  );
  const key = lk.rows[0]?.value;
  if (!key) { console.log("no landing key"); await c.end(); return; }
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const m = await c.query(
    `SELECT ak.kb_id, ak.is_active FROM api_keys ak WHERE ak.key_hash = $1`,
    [hash]
  );
  console.log("landing key maps to:", JSON.stringify(m.rows));
  fs.writeFileSync("/tmp/clr-key.txt", key);
  await c.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
