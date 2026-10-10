import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/Clara-AI-Platform/package.json");
const pg = require("pg");
const { readFileSync } = require("node:fs");
const { Client } = pg;
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const c = new Client({ connectionString: url });
await c.connect();
// One-time cleanup: the two pending rows are pre-fix e2e test artifacts
// (created before the finalization fix landed at 22:2x). Mark them error
// so the audit trail reflects the real outcome of those failed searches.
const r = await c.query(
  "UPDATE query_events SET status = 'error' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 minute' RETURNING id"
);
console.log("finalized legacy pending rows:", r.rowCount);
await c.end();
