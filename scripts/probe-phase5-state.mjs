import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/Clara-AI-Platform/package.json");
const pg = require("pg");
import { readFileSync } from "node:fs";
const { Client } = pg;
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const c = new Client({ connectionString: url });
await c.connect();

const q = async (label, sql) => {
  try { const r = await c.query(sql); console.log(`\n== ${label} ==`); for (const row of r.rows) console.log(JSON.stringify(row)); }
  catch (e) { console.log(`\n== ${label} == ERROR: ${e.message}`); }
};

await q("PLANS", `SELECT id, name, price_usd, max_kbs, max_req_day FROM subscription_plans ORDER BY price_usd`);
await q("ORGS+PLAN", `SELECT o.id, o.name, o.slug, s.plan_id, s.status FROM organisations o LEFT JOIN org_subscriptions s ON s.org_id=o.id ORDER BY o.created_at`);
await q("USERS", `SELECT id, email, is_super_admin, status FROM users ORDER BY created_at`);
await q("AGENTS", `SELECT a.id, a.name, a.org_id, a.status FROM agents a ORDER BY a.created_at`);
await q("KBS", `SELECT k.id, k.name, k.agent_id, k.qdrant_collection, k.status FROM knowledge_bases k ORDER BY k.created_at`);
await q("ASSISTANT CONFIGS", `SELECT agent_id, assistant_name, primary_colour, accent_colour FROM assistant_configs`);
await q("DOCS", `SELECT d.id, d.title, d.kb_id, d.status, d.chunk_count, d.mime_type FROM documents d ORDER BY d.created_at`);
await q("QUERY EVENTS per KB", `SELECT kb_id, count(*)::int AS n, min(created_at)::date AS from, max(created_at)::date AS to FROM query_events GROUP BY kb_id ORDER BY n DESC`);
await q("API KEYS", `SELECT id, name, org_id, kb_id, is_active FROM api_keys ORDER BY created_at`);
await c.end();
