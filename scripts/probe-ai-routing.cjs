/** Read-only probe: AI provider routing config + query_events health. */
const fs = require("node:fs");
const pg = require("/home/z/my-project/Clara-AI-Platform/node_modules/pg");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
const c = new pg.Client({ connectionString: dbUrl });

(async () => {
  await c.connect();
  for (const [label, sql] of [
    ["platform_settings (url/provider/proxy/base)",
      "select key, value from platform_settings where key ilike '%url%' or key ilike '%provider%' or key ilike '%proxy%' or key ilike '%base%'"],
    ["org_ai_settings", "select org_id, provider from org_ai_settings limit 5"],
    ["kb_ai_overrides", "select kb_id, provider from kb_ai_overrides limit 5"],
    ["query_events columns", "select column_name from information_schema.columns where table_name='query_events' order by ordinal_position"],
    ["recent query_events", "select * from query_events order by created_at desc limit 3"],
    ["knowledge_bases", "select kb.id, kb.name, kb.status, a.org_id from knowledge_bases kb join agents a on a.id=kb.agent_id"],
  ]) {
    try {
      const r = await c.query(sql);
      console.log("\n" + label + ":");
      console.log(JSON.stringify(r.rows, null, 1).slice(0, 700));
    } catch (e) {
      console.log("\n" + label + " ERR:", e.message.slice(0, 70));
    }
  }
  await c.end();
})();
