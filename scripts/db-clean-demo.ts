#!/usr/bin/env tsx
/**
 * scripts/db-clean-demo.ts — remove demo/development seed data and e2e test
 * artifacts from a database, leaving the production bootstrap data and ALL
 * real traffic untouched.
 *
 *   tsx scripts/db-clean-demo.ts                 DRY RUN: report what would be removed
 *   tsx scripts/db-clean-demo.ts --yes           execute the purge (single transaction)
 *   tsx scripts/db-clean-demo.ts --yes --skip-qdrant    keep vector collections
 *   tsx scripts/db-clean-demo.ts --no-e2e        leave @clara-test.ai users alone
 *
 * Removes (scoped to the fixed demo UUIDs — see src/lib/db/seed/demo.ts):
 *   • Omen United Insurance + TechVision Solutions demo tenants
 *     (orgs, logins, agents, KBs, sample documents, ingest jobs, personas,
 *      subscriptions, synthetic query/usage events, sessions, audit rows)
 *   • orphaned e2e test users (…@clara-test.ai with no org membership)
 *     and their sessions/audit rows
 *   • Qdrant collections that belonged to demo KBs, plus orphaned collections
 *     no knowledge_bases row references (never document_catalog)
 *
 * NEVER removes: the platform admin, platform settings, the Clara landing
 * demo, real organisations/users/agents/KBs/documents/events.
 */

// Load .env (Node >= 20.12) BEFORE importing the db pool, which reads
// POSTGRES_* at module-evaluation time.
try { process.loadEnvFile(); } catch { /* .env optional */ }

async function main() {
  const execute = process.argv.includes("--yes");
  const skipQdrant = process.argv.includes("--skip-qdrant");
  const includeE2e = !process.argv.includes("--no-e2e");

  const { pool } = await import("../src/lib/db");
  const { purgeDemoScope, cleanQdrantAfterPurge } = await import("../src/lib/db/seed/demo-purge");

  const label = execute ? "EXECUTE" : "DRY RUN (pass --yes to execute)";
  console.log(`[clean-demo] ${label} — target host: ${process.env.POSTGRES_HOST ?? "(env)"}`);

  let result;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    result = await purgeDemoScope(client, { includeE2eArtifacts: includeE2e });
    if (execute) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[clean-demo] FAILED (rolled back, nothing removed):", error);
    process.exitCode = 1;
    return;
  } finally {
    client.release();
  }

  const removed = result.rows.filter((r) => r.deleted > 0);
  const total = removed.reduce((n, r) => n + r.deleted, 0);
  console.log("\n=== Demo-scope rows " + (execute ? "removed" : "that would be removed") + " ===");
  for (const r of removed) console.log(`  ${r.table.padEnd(30)} ${r.deleted}`);
  if (removed.length === 0) console.log("  (none — database is already clean)");
  console.log(`  ${"TOTAL".padEnd(30)} ${total}`);

  if (result.e2eUsers.length > 0) {
    console.log("\n=== E2e test users " + (execute ? "removed" : "that would be removed") + " ===");
    for (const u of result.e2eUsers) console.log(`  ${u.email}`);
  }
  for (const u of result.skippedE2eUsers) {
    console.log(`  SKIPPED (still has org membership): ${u.email}`);
  }

  if (result.qdrantCollections.length > 0) {
    console.log("\n=== Demo Qdrant collections ===");
    for (const name of result.qdrantCollections) console.log(`  ${name}`);
  }

  if (execute && !skipQdrant) {
    const qdrant = await cleanQdrantAfterPurge({
      extraCollections: result.qdrantCollections,
    });
    if (qdrant.deleted.length > 0) {
      console.log("\n=== Qdrant collections deleted ===");
      for (const name of qdrant.deleted) console.log(`  ${name}`);
    }
    if (qdrant.errors.length > 0) {
      console.log("\n=== Qdrant collections NOT deleted (best-effort) ===");
      for (const e of qdrant.errors) console.log(`  ${e}`);
    }
  } else if (!execute) {
    console.log("\n[dry-run] Qdrant cleanup runs only with --yes (demo + orphaned collections).");
  }

  console.log(
    `\n[clean-demo] ${execute ? "done" : "dry run complete"} — production bootstrap data and real traffic untouched.`,
  );
}

main()
  .catch((error) => {
    console.error("[clean-demo] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Close the pool so the process exits cleanly.
    import("../src/lib/db")
      .then(({ pool }) => pool.end().catch(() => {}))
      .catch(() => {});
  });
