#!/usr/bin/env node
/**
 * scripts/backup-ai-configuration.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * AI configuration backup / export procedure — implements the Phase 0
 * requirement of docs/superpowers/plans/2026-09-20-clara-ai-configuration-
 * platform-agent.md ("Establish database backup/export procedure") and backs
 * the rollback story of the migration plan (§ "Before migration" + § Rollback).
 *
 * What it does (READ-ONLY — never writes to the database):
 *
 *   1. Logical JSON export of every AI-configuration-relevant table, both the
 *      legacy sources (org_ai_settings, agents, config_snapshots,
 *      platform_env_settings, platform_assistant_defaults) and the new
 *      governance/versioning tables (platform_ai_*, plan_ai_*,
 *      agent_branches/_versions/_drafts/_deployments,
 *      platform_assistant_default_versions).
 *      → backups/ai-configuration-<timestamp>.json
 *
 *   2. Optional full physical dump of the entire database via pg_dump:
 *      node scripts/backup-ai-configuration.mjs --pg-dump
 *      → backups/clara-full-<timestamp>.sql.gz
 *      (requires pg_dump + gzip on PATH; connection details are taken from
 *      DATABASE_URL, the password is passed via PGPASSWORD — never argv)
 *
 * Secret hygiene: values of platform_env_settings rows flagged is_secret are
 * REDACTED by default. Pass --include-secrets only when the backup target is
 * access-controlled (the redacted export is sufficient to audit/restore AI
 * configuration structure; the physical pg_dump always contains secrets).
 *
 * Tables that do not exist yet (e.g. pre-040 schema) are recorded as
 * { "__table_missing": true } so the same script works before AND after the
 * migration — run it before `migrate-ai-configuration.mjs --apply` (safety
 * snapshot) and after (verification snapshot).
 *
 * Usage:
 *   node scripts/backup-ai-configuration.mjs                     # logical export (secrets redacted)
 *   node scripts/backup-ai-configuration.mjs --include-secrets  # logical export with secret values
 *   node scripts/backup-ai-configuration.mjs --pg-dump          # + full physical dump
 *   node scripts/backup-ai-configuration.mjs --out /mnt/safe    # custom output dir
 *
 * Exit codes: 0 = ok · 1 = failure (no DB / export error / pg_dump error)
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const argv = process.argv.slice(2);
const INCLUDE_SECRETS = argv.includes("--include-secrets");
const DO_PG_DUMP = argv.includes("--pg-dump");
const outDirIdx = argv.indexOf("--out");
const OUT_DIR = path.resolve(
  outDirIdx !== -1 && argv[outDirIdx + 1] ? argv[outDirIdx + 1] : "backups"
);

function log(...args) {
  console.log("[backup-ai]", ...args);
}

// ── DB connection (repo .env carries the Postgres URL) ────────────────────────
const envPath = path.join(process.cwd(), ".env");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const envVars = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pgUrl =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : envVars.DATABASE_URL;
if (!pgUrl || !pgUrl.startsWith("postgres")) {
  console.error("[backup-ai] No postgres DATABASE_URL found in .env — aborting.");
  process.exit(1);
}

// ── Table inventory ───────────────────────────────────────────────────────────
// Ordered: legacy sources first, then governance, entitlements, defaults,
// agent version control. redactWhere/redactColumn = column-level secret mask.

const TABLES = [
  // legacy AI configuration (the migration's source of truth)
  { table: "org_ai_settings", group: "legacy" },
  { table: "agents", group: "legacy" },
  { table: "config_snapshots", group: "legacy" },
  { table: "platform_env_settings", group: "legacy", redactWhere: "is_secret", redactColumn: "value" },
  { table: "platform_assistant_defaults", group: "legacy-defaults" },
  // platform provider governance (migration 040)
  { table: "platform_ai_providers", group: "governance" },
  { table: "platform_ai_provider_credentials", group: "governance" },
  { table: "platform_ai_provider_capabilities", group: "governance" },
  { table: "platform_ai_provider_models", group: "governance" },
  { table: "platform_ai_provider_health", group: "governance" },
  { table: "platform_ai_provider_usage", group: "governance" },
  { table: "platform_ai_defaults", group: "governance" },
  // subscription AI entitlements (migration 040)
  { table: "plan_ai_capabilities", group: "entitlements" },
  { table: "plan_ai_provider_entitlements", group: "entitlements" },
  { table: "plan_ai_model_entitlements", group: "entitlements" },
  // platform default assistant versioning (migration 040)
  { table: "platform_assistant_default_versions", group: "assistant-defaults" },
  // agent version control (migration 040)
  { table: "agent_branches", group: "agent-versioning" },
  { table: "agent_versions", group: "agent-versioning" },
  { table: "agent_drafts", group: "agent-versioning" },
  { table: "agent_deployments", group: "agent-versioning" },
];

const REDACTED = "__REDACTED__";

// ── Logical export ────────────────────────────────────────────────────────────

async function exportLogical(client) {
  const payload = {
    generatedAt: new Date().toISOString(),
    secrets: INCLUDE_SECRETS ? "included" : "redacted",
    database: pgUrl.replace(/\/\/[^@]*@/, "//***@"), // host visible, credentials not
    rowCounts: {},
    groups: {},
  };

  for (const spec of TABLES) {
    let rows;
    try {
      const result = await client.query(`SELECT * FROM ${spec.table} ORDER BY 1`);
      rows = result.rows;
    } catch (err) {
      if (err.code === "42P01") {
        // undefined_table — schema not migrated yet: expected pre-040
        payload.rowCounts[spec.table] = "TABLE_MISSING";
        payload.groups[spec.group] = payload.groups[spec.group] || {};
        payload.groups[spec.group][spec.table] = { __table_missing: true };
        continue;
      }
      throw new Error(`export ${spec.table} failed: ${err.message}`);
    }

    if (spec.redactWhere && !INCLUDE_SECRETS) {
      rows = rows.map((row) =>
        row[spec.redactWhere] === true
          ? { ...row, [spec.redactColumn]: REDACTED }
          : row
      );
    }

    payload.rowCounts[spec.table] = rows.length;
    payload.groups[spec.group] = payload.groups[spec.group] || {};
    payload.groups[spec.group][spec.table] = rows;
  }

  return payload;
}

// ── Physical pg_dump ──────────────────────────────────────────────────────────

function runPgDump() {
  // Connection parts go via argv (host/port/db), the password via PGPASSWORD
  // env — it never appears in a process listing.
  const url = new URL(pgUrl);
  const db = url.pathname.replace(/^\//, "");
  const host = url.hostname;
  const port = url.port || "5432";
  const user = decodeURIComponent(url.username || "postgres");
  const password = decodeURIComponent(url.password || "");

  const outPath = path.join(OUT_DIR, `clara-full-${timestamp()}.sql.gz`);
  const env = { ...process.env };
  if (password) env.PGPASSWORD = password;

  const dump = spawnSync(
    "pg_dump",
    ["--no-owner", "--no-privileges", "--format=plain", "-h", host, "-p", port, "-U", user, db],
    { env, stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" }
  );
  if (dump.status !== 0 || !dump.stdout) {
    const detail = dump.stderr ? dump.stderr.toString().slice(0, 300) : "";
    throw new Error(`pg_dump exited ${dump.status}${detail ? ": " + detail : ""}`);
  }

  const gz = spawnSync("gzip", ["-c"], { input: dump.stdout, maxBuffer: 1024 * 1024 * 1024 });
  if (gz.status !== 0) throw new Error("gzip failed");
  fs.writeFileSync(outPath, gz.stdout);
  return outPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const client = new Client({ connectionString: pgUrl });

  let logicalPath = null;

  try {
    await client.connect();
    log("connected — read-only export starting.");

    const payload = await exportLogical(client);
    logicalPath = path.join(OUT_DIR, `ai-configuration-${timestamp()}.json`);
    fs.writeFileSync(logicalPath, JSON.stringify(payload, null, 2) + "\n");

    // Summary (console — compact enough to paste into a runbook)
    log("row counts:");
    for (const [table, count] of Object.entries(payload.rowCounts)) {
      const marker = count === "TABLE_MISSING" ? "  (table not created yet — expected pre-migration)" : "";
      log(`  ${table.padEnd(38)} ${String(count).padStart(6)}${marker}`);
    }
    log(`logical export written → ${logicalPath} (secrets ${payload.secrets})`);
  } finally {
    await client.end().catch(() => {});
  }

  if (DO_PG_DUMP) {
    const which = spawnSync("which", ["pg_dump"], { encoding: "utf8" });
    if (which.status !== 0) {
      console.error(
        "[backup-ai] pg_dump not found on PATH — skipping physical dump.\n" +
        "[backup-ai] Install postgresql-client, or run from a machine with client tools:\n" +
        "[backup-ai]   PGPASSWORD=*** pg_dump -h <host> -p <port> -U <user> <db> | gzip > clara-full.sql.gz"
      );
      process.exitCode = 1;
    } else {
      try {
        const physicalPath = runPgDump();
        const bytes = fs.statSync(physicalPath).size;
        log(`physical pg_dump written → ${physicalPath} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
      } catch (err) {
        console.error(`[backup-ai] pg_dump failed: ${err.message}`);
        process.exitCode = 1;
      }
    }
  }

  log("done — backup is read-only; the database was not modified.");
  if (!DO_PG_DUMP) {
    log("tip: add --pg-dump for a full physical backup suitable for point-in-time restore.");
  }
}

main().catch((err) => {
  console.error(`[backup-ai] FAILED: ${err.message}`);
  process.exit(1);
});
