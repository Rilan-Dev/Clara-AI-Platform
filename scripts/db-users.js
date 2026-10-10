/* Quick DB peek: list users so we can log in for the admin smoke test. */
const fs = require("fs");
const path = require("path");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];

const c = new Client({ connectionString: url });
(async () => {
  await c.connect();
  const r = await c.query(
    "select email, full_name, status, email_verified from users order by created_at limit 10"
  );
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
