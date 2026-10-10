/* Fetch an active embed API key for the FAQ KB + run E2E Sarvam checks.
 * Prints only key prefix/suffix — never the full secret. */
const fs = require("fs");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

const c = new Client({ connectionString: url });
(async () => {
  await c.connect();
  // discover the embed key table
  const tables = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%embed%'"
  );
  console.log("embed tables:", tables.rows.map((r) => r.table_name).join(", "));

  const keyRow = await c.query(
    `SELECT k.api_key, k.kb_id, k.status FROM embed_api_keys k WHERE k.kb_id = '197fbb70-8565-4216-a5ed-a78489dcc9d4' AND k.status = 'active' LIMIT 1`
  ).catch(async () => {
    // fallback: try api_keys naming
    return c.query(
      `SELECT api_key, kb_id, status FROM api_keys WHERE kb_id = '197fbb70-8565-4216-a5ed-a78489dcc9d4' AND status = 'active' LIMIT 1`
    );
  });
  if (!keyRow.rows.length) { console.log("NO ACTIVE EMBED KEY for that KB"); }
  else {
    const k = keyRow.rows[0].api_key;
    console.log(`key: ${k.slice(0, 8)}...${k.slice(-4)} (len ${k.length})`);
    // write to a temp file for the curl step (kept out of stdout)
    fs.writeFileSync("/tmp/clr-key.txt", k);
  }
  await c.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
