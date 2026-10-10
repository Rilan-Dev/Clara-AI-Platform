#!/usr/bin/env node
/**
 * find-demo-references.mjs — enumerate every table that could hold demo-scope
 * rows (org_id / kb_id / agent_id / user_id / document_id columns), and count
 * demo rows + orphaned e2e test users in the production DB.
 */
import pg from "/home/z/my-project/Clara-AI-Platform/node_modules/pg/lib/index.js";

const { Client } = pg;
const client = new Client({
  host: "180.188.231.138", port: 1234,
  user: "clara", password: "clarapassword", database: "clara_platform",
});

const DEMO_ORGS = ["10000000-0000-0000-0000-000000000010", "10000000-0000-0000-0000-000000000011"];
const DEMO_USERS = ["40000000-0000-0000-0000-000000000010", "40000000-0000-0000-0000-000000000011"];
const DEMO_KBS = [
  "30000000-0000-0000-0000-000000000010", "30000000-0000-0000-0000-000000000011",
  "30000000-0000-0000-0000-000000000012", "30000000-0000-0000-0000-000000000013",
  "30000000-0000-0000-0000-000000000014",
];
const DEMO_AGENTS = ["20000000-0000-0000-0000-000000000010", "20000000-0000-0000-0000-000000000011"];

try {
  await client.connect();

  // 1. Every table with an org-scoping column
  const cols = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('org_id','kb_id','agent_id','user_id','document_id','organisation_id')
    ORDER BY table_name`);
  const byTable = {};
  for (const r of cols.rows) (byTable[r.table_name] ??= []).push(r.column_name);
  console.log("=== Tables with scope columns ===");
  for (const [t, cs] of Object.entries(byTable)) console.log(`${t}: ${cs.join(", ")}`);

  // 2. Count demo rows per table where possible
  console.log("\n=== Demo-scope row counts ===");
  for (const [t, cs] of Object.entries(byTable)) {
    const conds = [];
    const params = [];
    if (cs.includes("org_id")) { params.push(DEMO_ORGS); conds.push(`org_id = ANY($${params.length}::uuid[])`); }
    if (cs.includes("kb_id")) { params.push(DEMO_KBS); conds.push(`kb_id = ANY($${params.length}::uuid[])`); }
    if (cs.includes("agent_id")) { params.push(DEMO_AGENTS); conds.push(`agent_id = ANY($${params.length}::uuid[])`); }
    if (cs.includes("user_id")) { params.push(DEMO_USERS); conds.push(`user_id = ANY($${params.length}::uuid[])`); }
    if (!conds.length) continue;
    try {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${t} WHERE ${conds.join(" OR ")}`, params);
      if (r.rows[0].n > 0) console.log(`${t}: ${r.rows[0].n} demo rows`);
    } catch (e) { console.log(`${t}: query failed (${e.message})`); }
  }

  // 3. Orphaned e2e test users
  const e2e = await client.query(`
    SELECT u.id, u.email,
      (SELECT COUNT(*)::int FROM org_members om WHERE om.user_id = u.id) AS memberships,
      (SELECT COUNT(*)::int FROM query_events qe WHERE qe.user_id = u.id) AS events,
      (SELECT COUNT(*)::int FROM usage_events ue WHERE ue.org_id IS NULL AND false) AS usage
    FROM users u WHERE u.email LIKE '%@clara-test.ai'`);
  console.log("\n=== Orphaned e2e test users ===");
  for (const r of e2e.rows) console.log(JSON.stringify(r));

  // e2e user sessions + any other references
  const e2eIds = e2e.rows.map(r => r.id);
  if (e2eIds.length) {
    for (const [tbl, col] of [["sessions","user_id"],["query_events","user_id"],["audit_logs","user_id"],["platform_events","user_id"],["password_reset_tokens","user_id"],["agent_members","user_id"]]) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${tbl} WHERE ${col} = ANY($1::uuid[])`, [e2eIds]);
      if (r.rows[0].n > 0) console.log(`e2e users → ${tbl}: ${r.rows[0].n} rows`);
    }
  }

  // 4. usage_events by org
  {
    const r = await client.query(`SELECT org_id, COUNT(*)::int AS n FROM usage_events GROUP BY org_id ORDER BY n DESC LIMIT 12`);
    console.log("\n=== usage_events by org ===");
    for (const row of r.rows) console.log(JSON.stringify(row));
  }

  // 5. demo documents + ingest jobs detail
  const docs = await client.query(`
    SELECT d.id, d.title, d.kb_id, (SELECT COUNT(*)::int FROM ingest_jobs ij WHERE ij.document_id = d.id) AS jobs
    FROM documents d WHERE d.kb_id = ANY($1::uuid[])`, [DEMO_KBS]);
  console.log("\n=== Demo documents ===");
  for (const r of docs.rows) console.log(JSON.stringify(r));
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
