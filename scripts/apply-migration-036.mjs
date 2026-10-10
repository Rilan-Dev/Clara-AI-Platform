#!/usr/bin/env node
/**
 * apply-migration-036.mjs — V0 acceptance for the Sarvam provider migration.
 *
 * Mirrors src/lib/db/migrate.ts mechanics exactly:
 *   1. ledger check (skip if already applied)
 *   2. BEGIN → file SQL → INSERT schema_migrations → COMMIT
 *   3. re-run the raw SQL in a ROLLED-BACK transaction (idempotency proof)
 *   4. post-state assertions: widened constraints, new columns, seeds, ledger
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  path.join("/home/z/my-project/Clara-AI-Platform", "package.json"),
);
const pg = require("pg");

const FILE = "036_sarvam_provider.sql";
const SQL_PATH = path.join(
  "/home/z/my-project/Clara-AI-Platform",
  "src/lib/db/migrations",
  FILE,
);

const client = new pg.Client({
  host: process.env.POSTGRES_HOST ?? "180.188.231.138",
  port: Number(process.env.POSTGRES_PORT ?? 1234),
  user: process.env.POSTGRES_USER ?? "clara",
  password: process.env.POSTGRES_PASSWORD ?? "clarapassword",
  database: process.env.POSTGRES_DB ?? "clara_platform",
  connectionTimeoutMillis: 10_000,
});

const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => { console.error(`  ✖ ${msg}`); process.exitCode = 1; };

async function constraintDef(table, name) {
  const r = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = $1::regclass AND conname = $2`,
    [table, name],
  );
  return r.rows[0]?.def ?? null;
}

async function main() {
  await client.connect();
  const sql = await readFile(SQL_PATH, "utf8");

  // 1. ledger check
  const ledger = await client.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1", [FILE],
  );
  if (ledger.rowCount > 0) {
    console.log(`[skip] ${FILE} already recorded in schema_migrations — running idempotency proof only`);
  } else {
    console.log(`[apply] ${FILE} via BEGIN/COMMIT + ledger insert (migrate.ts pattern)`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [FILE]);
      await client.query("COMMIT");
      ok("migration applied and recorded");
    } catch (err) {
      await client.query("ROLLBACK");
      fail(`migration FAILED (rolled back): ${err.message}`);
      await client.end();
      return;
    }
  }

  // 2. idempotency proof — full re-run inside a ROLLBACK-ed transaction
  console.log("[idempotency] re-running the raw SQL a second time (expect success, then ROLLBACK)");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("ROLLBACK");
    ok("second run succeeded → SQL is idempotent");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    fail(`second run FAILED — not idempotent: ${err.message}`);
  }

  // 3. post-state assertions
  console.log("[verify] post-state assertions");

  const checks = [
    ["org_ai_settings", "org_ai_settings_default_provider_check", "sarvam"],
    ["org_ai_settings", "org_ai_settings_allowed_providers_check", "sarvam"],
    ["org_ai_settings", "org_ai_settings_voice_provider_check", "sarvam"],
    ["agent_ai_settings", "agent_ai_settings_provider_check", "sarvam"],
    ["agent_ai_settings", "agent_ai_settings_voice_provider_check", "sarvam"],
    ["kb_ai_overrides", "kb_ai_overrides_provider_check", "sarvam"],
    ["kb_ai_overrides", "kb_ai_overrides_voice_provider_check", "sarvam"],
    ["organisation_voices", "organisation_voices_provider_check", "sarvam"],
    ["usage_events", "usage_events_kind_check", "TRANSLATION"],
  ];
  for (const [table, name, needle] of checks) {
    const def = await constraintDef(table, name);
    if (def && def.includes(needle)) ok(`${name} widened (+${needle})`);
    else fail(`${name} missing or not widened — got: ${def}`);
  }

  // cardinality check untouched
  const card = await constraintDef("org_ai_settings", "org_ai_settings_allowed_providers_check1");
  if (card && card.includes("cardinality")) ok("allowed_providers_check1 (cardinality) untouched");
  else fail(`allowed_providers_check1 unexpectedly changed: ${card}`);

  // new columns
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'org_ai_settings'
        AND column_name IN ('sarvam_tts_model','sarvam_stt_model','default_sarvam_speaker','translation_mode')`,
  );
  const colNames = cols.rows.map((r) => r.column_name).sort();
  const expected = ["default_sarvam_speaker", "sarvam_stt_model", "sarvam_tts_model", "translation_mode"];
  if (JSON.stringify(colNames) === JSON.stringify(expected)) ok(`org columns added: ${colNames.join(", ")}`);
  else fail(`org columns wrong: ${colNames.join(", ")}`);

  // translation_mode default + check
  const tm = await client.query(
    "SELECT translation_mode, count(*) FROM org_ai_settings GROUP BY translation_mode",
  );
  if (tm.rows.every((r) => r.translation_mode === "off")) ok(`translation_mode defaults 'off' for all ${tm.rows.reduce((a, r) => a + Number(r.count), 0)} org rows`);
  else fail(`translation_mode unexpected values: ${JSON.stringify(tm.rows)}`);

  // plan budget columns
  const plans = await client.query(
    `SELECT table_name FROM information_schema.columns
      WHERE column_name = 'max_translation_chars_day' AND table_name IN ('subscription_plans','subscription_plan_versions')`,
  );
  if (plans.rows.length === 2) ok("max_translation_chars_day on both plan tables");
  else fail(`max_translation_chars_day present on: ${plans.rows.map((r) => r.table_name).join(", ")}`);

  // seeds
  const seeds = await client.query("SELECT key, value FROM platform_env_settings WHERE key LIKE 'SARVAM%' ORDER BY key");
  if (seeds.rows.length === 13) ok("13 SARVAM_* env keys seeded");
  else fail(`expected 13 SARVAM_* keys, found ${seeds.rows.length}`);
  const enabled = seeds.rows.find((r) => r.key === "SARVAM_ENABLED");
  if (enabled?.value === "false") ok("SARVAM_ENABLED seeded false (dark launch)");
  else fail(`SARVAM_ENABLED = ${enabled?.value}`);
  const fx = seeds.rows.find((r) => r.key === "SARVAM_INR_TO_USD");
  if (fx?.value === "0.012") ok("SARVAM_INR_TO_USD seeded 0.012");
  else fail(`SARVAM_INR_TO_USD = ${fx?.value}`);

  // ledger row
  const led = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [FILE]);
  if (led.rowCount === 1) ok("schema_migrations ledger row present");

  await client.end();
  console.log(process.exitCode ? "\nRESULT: FAILED" : "\nRESULT: ALL GREEN");
}

main().catch(async (err) => {
  console.error("FATAL:", err.message);
  try { await client.end(); } catch { /* noop */ }
  process.exit(1);
});
