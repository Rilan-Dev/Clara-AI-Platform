import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/Clara-AI-Platform/package.json");
const pg = require("pg");
import { readFileSync } from "node:fs";
const { Client } = pg;
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const c = new Client({ connectionString: url });
await c.connect();
const orgs = await c.query(`
  SELECT o.id, o.name, o.slug, p.name AS plan, o.created_at
  FROM organisations o LEFT JOIN org_subscriptions s ON s.org_id = o.id AND s.status = 'active'
  LEFT JOIN subscription_plans p ON p.id = s.plan_id ORDER BY o.created_at`);
console.log("ORGS:");
for (const r of orgs.rows) console.log(` ${r.id} | ${r.name} | ${r.slug} | plan=${r.plan ?? "none"}`);
const tv = orgs.rows.find((r) => /techvision/i.test(r.name));
if (tv) {
  const kbs = await c.query("SELECT id, name, status FROM knowledge_bases WHERE org_id = $1", [tv.id]);
  console.log("TV KBs:", JSON.stringify(kbs.rows));
  const users = await c.query("SELECT u.id, u.email, u.name FROM users u JOIN organisation_members m ON m.user_id = u.id WHERE m.org_id = $1 LIMIT 5", [tv.id]);
  console.log("TV users:", JSON.stringify(users.rows));
  const emb = await c.query("SELECT id, kb_id, api_key, is_active FROM embed_api_keys WHERE kb_id = ANY($1::uuid[])", [kbs.rows.map((k) => k.id)]);
  console.log("TV embed keys:", JSON.stringify(emb.rows));
  const agents = await c.query("SELECT id, name FROM agents WHERE org_id = $1", [tv.id]);
  console.log("TV agents:", JSON.stringify(agents.rows));
  console.log("TV agents:", JSON.stringify(agents.rows));
}
await c.end();
