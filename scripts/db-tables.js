/* Discover embed key tables/columns, then fetch an active key for the FAQ KB. */
const fs = require("fs");
const { Client } = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];
const c = new Client({ connectionString: url });

(async () => {
  await c.connect();
  const t = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%embed%' OR table_name LIKE '%api_key%')"
  );
  for (const { table_name } of t.rows) {
    const cols = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = $1",
      [table_name]
    );
    console.log(table_name + ":", cols.rows.map((x) => x.column_name).join(", "));
  }
  await c.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
