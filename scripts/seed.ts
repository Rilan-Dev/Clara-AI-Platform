#!/usr/bin/env tsx
/**
 * scripts/seed.ts — database seeding entry point.
 *
 *   tsx scripts/seed.ts --prod   production bootstrap (default when NODE_ENV=production)
 *   tsx scripts/seed.ts --dev    production bootstrap + demo dataset (local dev only)
 *
 * Both modes are idempotent: safe to re-run at any time.
 */

// Load .env (Node >= 20.12) BEFORE importing the db pool, which reads
// POSTGRES_* at module-evaluation time.
try { process.loadEnvFile(); } catch { /* .env optional */ }

async function main() {
  const wantsDev = process.argv.includes("--dev");
  const wantsProd = process.argv.includes("--prod");
  const mode = wantsDev
    ? "dev"
    : wantsProd || process.env.NODE_ENV === "production"
      ? "prod"
      : null;

  if (!mode) {
    console.error("Usage: tsx scripts/seed.ts --prod | --dev");
    console.error("  --prod  production bootstrap (also the default when NODE_ENV=production)");
    console.error("  --dev   production bootstrap + demo dataset (NEVER on a production DB)");
    process.exit(1);
  }

  if (mode === "dev" && process.env.NODE_ENV === "production") {
    console.error("[seed] refusing --dev seed while NODE_ENV=production");
    process.exit(1);
  }

  const { pool } = await import("../src/lib/db");
  const { seedProductionData } = await import("../src/lib/db/seed/production");
  const { seedDevelopmentData } = await import("../src/lib/db/seed/development");

  try {
    if (mode === "prod") {
      await seedProductionData();
      console.log("\nLogin credentials:");
      console.log(`  Platform admin: ${process.env.CLARA_ADMIN_EMAIL ?? "admin@clara.ai"} / ${process.env.CLARA_ADMIN_PASSWORD ?? "Admin1234!"}\n`);
    } else {
      await seedDevelopmentData();
      console.log("\nLogin credentials:");
      console.log("  Platform admin:   admin@clara.ai             / Admin1234!");
      console.log("  Omen admin:       admin@omeninsurance.com    / Omen1234!");
      console.log("  TechVision admin: admin@techvision.io        / Tech1234!\n");
    }
  } catch (error) {
    console.error("[seed] Failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
