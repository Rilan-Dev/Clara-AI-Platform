import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/Clara-AI-Platform/package.json");
const pg = require("pg");
const { readFileSync } = require("node:fs");
const { Client } = pg;
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const c = new Client({ connectionString: url });
await c.connect();
const q = await c.query(`
  SELECT status, COUNT(*) AS n,
         MAX(created_at) AS latest,
         SUM(CASE WHEN answer_text IS NOT NULL AND LENGTH(answer_text) > 0 THEN 1 ELSE 0 END) AS with_answer
  FROM query_events WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY status ORDER BY n DESC`);
console.log("query_events (7d):");
for (const r of q.rows) console.log(` ${r.status}: ${r.n} (with_answer=${r.with_answer}, latest=${r.latest}`);
const ok = await c.query(`
  SELECT LEFT(answer_text, 90) AS sample, latency_ms, created_at
  FROM query_events WHERE status = 'ok' AND answer_text IS NOT NULL
  ORDER BY created_at DESC LIMIT 3`);
console.log("successful answers sample:");
for (const r of ok.rows) console.log(` [${r.created_at.toISOString()}] (${r.latency_ms}ms) ${r.sample}`);
await c.end();
