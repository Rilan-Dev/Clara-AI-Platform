#!/usr/bin/env tsx
/**
 * scripts/seed-demo.ts — demo dataset CLI (LOCAL DEVELOPMENT ONLY).
 *
 *   npm run seed:dev / seed:demo   full demo seed (production bootstrap + demo tenants)
 *   npm run seed:reset             purge demo data (demo UUID scope only) and re-seed
 *   tsx scripts/seed-demo.ts [--reset] [--force]
 *
 * Idempotent and safe to re-run on a development database.
 *
 * Guarded (see src/lib/db/seed/demo-guard.ts) — REFUSES unless:
 *   • NODE_ENV is explicitly set to a non-production value (e.g. development)
 *   • the database host is local (localhost / docker-compose service name)
 * A remote shared dev database additionally requires `--force`.
 * The demo dataset (synthetic analytics, demo tenants) must never touch a
 * live production database. For production use `npm run seed:prod`.
 */

// Load .env (Node >= 20.12) BEFORE importing the db pool, which reads
// POSTGRES_* at module-evaluation time.
try { process.loadEnvFile(); } catch { /* .env optional */ }

async function main() {
  const wantsReset = process.argv.includes("--reset");

  const { checkDemoSeedAllowed, formatDemoSeedRefusal } = await import("../src/lib/db/seed/demo-guard");
  const check = checkDemoSeedAllowed();
  if (!check.allowed) {
    console.error(formatDemoSeedRefusal(check));
    process.exit(1);
  }
  if (check.forced) {
    console.warn(
      `[seed:demo] --force accepted: demo data will be written to REMOTE host "${check.dbHost}". ` +
      "Never do this on a production database.",
    );
  }

  const { pool } = await import("../src/lib/db");
  const { seedDemoData, resetDemoData } = await import("../src/lib/db/seed/demo");

  try {
    if (wantsReset) {
      await resetDemoData();
    } else {
      await seedDemoData();
    }
    console.log("\nLogin credentials:");
    console.log("  Platform admin:   admin@clara.ai                  / Admin1234!");
    console.log("  Demo org user:    demo@clara.ai                   / Demo1234!   (Enterprise)");
    console.log("  Omen admin:       omen-admin@omeninsurance.com    / Omen1234!   (Pro)");
    console.log("  TechVision admin: techvision-admin@techvision.io  / Tech1234!   (Starter)");
    console.log("\nSample documents are queued through the real ingest pipeline;");
    console.log("they finish processing when a worker with AI provider access runs");
    console.log("(the server's ingest poller, or GET /api/worker/ingest).\n");
  } catch (error) {
    console.error("[seed:demo] Failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
