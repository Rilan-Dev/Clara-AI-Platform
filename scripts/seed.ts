#!/usr/bin/env tsx
/**
 * scripts/seed.ts — database seeding entry point.
 *
 *   tsx scripts/seed.ts --prod   production bootstrap (the DEFAULT — also `npm run seed`)
 *   tsx scripts/seed.ts --dev    production bootstrap + demo dataset (local dev only)
 *
 * Both modes are idempotent: safe to re-run at any time.
 *
 * The default is always the PRODUCTION bootstrap — the safe path that only
 * writes what a real deployment needs. The --dev mode is guarded by
 * src/lib/db/seed/demo-guard.ts: it requires an explicit NODE_ENV (normally
 * "development"), a local database host, and `--force` for a remote shared
 * dev database. The demo dataset must never land on a production database.
 *
 * The full Phase 5 demo story (npm run seed:dev / seed:reset) is served by
 * scripts/seed-demo.ts.
 */

// Load .env (Node >= 20.12) BEFORE importing the db pool, which reads
// POSTGRES_* at module-evaluation time.
try { process.loadEnvFile(); } catch { /* .env optional */ }

async function main() {
  const wantsDev = process.argv.includes("--dev");
  const mode = wantsDev ? "dev" : "prod";

  if (mode === "dev") {
    const { checkDemoSeedAllowed, formatDemoSeedRefusal } = await import("../src/lib/db/seed/demo-guard");
    const check = checkDemoSeedAllowed();
    if (!check.allowed) {
      console.error(formatDemoSeedRefusal(check));
      process.exit(1);
    }
    if (check.forced) {
      console.warn(
        `[seed] --force accepted: demo data will be written to REMOTE host "${check.dbHost}". ` +
        "Never do this on a production database.",
      );
    }
  }

  const { pool } = await import("../src/lib/db");
  const { seedProductionData } = await import("../src/lib/db/seed/production");
  const { seedDevelopmentData } = await import("../src/lib/db/seed/development");

  try {
    if (mode === "prod") {
      await seedProductionData();
      console.log("\nLogin credentials:");
      console.log(`  Platform admin: ${process.env.CLARA_ADMIN_EMAIL ?? "admin@clara.ai"} / ${process.env.CLARA_ADMIN_PASSWORD ?? "Admin1234!"}`);
      console.log(`  Demo org user:  ${process.env.CLARA_DEMO_USER_EMAIL ?? "demo@clara.ai"} / ${process.env.CLARA_DEMO_USER_PASSWORD ?? "Demo1234!"} (Enterprise)\n`);
    } else {
      await seedDevelopmentData();
      console.log("\nLogin credentials:");
      console.log("  Platform admin:   admin@clara.ai                  / Admin1234!");
      console.log("  Demo org user:    demo@clara.ai                   / Demo1234!   (Enterprise)");
      console.log("  Omen admin:       omen-admin@omeninsurance.com    / Omen1234!   (Pro)");
      console.log("  TechVision admin: techvision-admin@techvision.io  / Tech1234!   (Starter)\n");
    }
  } catch (error) {
    console.error("[seed] Failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
