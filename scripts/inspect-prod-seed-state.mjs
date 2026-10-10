#!/usr/bin/env node
/**
 * inspect-prod-seed-state.mjs — read-only audit of the production DB's seed state.
 *
 * Answers: does the production database contain development/demo seed data
 * (Omen United Insurance, TechVision, synthetic query events), and what
 * production-seed rows exist (platform admin, Clara demo org, settings)?
 */
import pg from "/home/z/my-project/Clara-AI-Platform/node_modules/pg/lib/index.js";

const { Client } = pg;

const client = new Client({
  host: "180.188.231.138",
  port: 1234,
  user: "clara",
  password: "clarapassword",
  database: "clara_platform",
});

const q = async (label, sql, params = []) => {
  const res = await client.query(sql, params);
  console.log(`\n=== ${label} (${res.rows.length} rows) ===`);
  for (const row of res.rows) console.log(JSON.stringify(row));
  return res.rows;
};

try {
  await client.connect();

  await q("organisations", `
    SELECT id, name, slug, created_at FROM organisations ORDER BY created_at, id`);
  await q("users", `
    SELECT id, email, full_name, is_super_admin, status FROM users ORDER BY id`);
  await q("agents", `
    SELECT a.id, a.name, a.org_id, o.name AS org_name, a.status
    FROM agents a LEFT JOIN organisations o ON o.id = a.org_id ORDER BY a.id`);
  await q("knowledge_bases", `
    SELECT kb.id, kb.name, kb.qdrant_collection, kb.status, o.name AS org_name
    FROM knowledge_bases kb
    LEFT JOIN agents a ON a.id = kb.agent_id
    LEFT JOIN organisations o ON o.id = a.org_id ORDER BY kb.id`);
  await q("org_subscriptions", `
    SELECT org_id, plan_id, status, gateway, admin_note FROM org_subscriptions ORDER BY org_id`);
  await q("org_members", `
    SELECT om.org_id, o.name AS org_name, u.email, r.name AS role
    FROM org_members om
    JOIN organisations o ON o.id = om.org_id
    JOIN users u ON u.id = om.user_id
    LEFT JOIN roles r ON r.id = om.role_id ORDER BY o.name, u.email`);
  await q("query_events count by KB", `
    SELECT kb.id, kb.name, COUNT(qe.id) AS events, MIN(qe.created_at) AS first, MAX(qe.created_at) AS last
    FROM knowledge_bases kb LEFT JOIN query_events qe ON qe.kb_id = kb.id
    GROUP BY kb.id, kb.name ORDER BY kb.id`);
  await q("documents", `
    SELECT d.id, d.title, d.original_filename, d.status, kb.name AS kb_name
    FROM documents d LEFT JOIN knowledge_bases kb ON kb.id = d.kb_id ORDER BY d.id`);
  await q("ingest_jobs", `
    SELECT ij.id, ij.status, ij.type, d.title AS doc_title
    FROM ingest_jobs ij LEFT JOIN documents d ON d.id = ij.document_id ORDER BY ij.id`);
  await q("assistant_configs", `
    SELECT ac.agent_id, ac.assistant_name, a.name AS agent_name
    FROM assistant_configs ac LEFT JOIN agents a ON a.id = ac.agent_id ORDER BY ac.agent_id`);
  await q("api_keys", `
    SELECT id, name, key_prefix, is_active, org_id FROM api_keys ORDER BY id`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
