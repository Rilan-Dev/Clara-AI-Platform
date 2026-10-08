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

import {
  createCliSummary,
  printBanner,
  printRuntime,
  printSection,
  printSummary,
  stage,
} from "../src/lib/cli/observability";

// Load .env (Node >= 20.12) BEFORE importing the db pool, which reads
// POSTGRES_* at module-evaluation time.
try { process.loadEnvFile(); } catch { /* .env optional */ }

async function databasePreflight(pool: { connect: () => Promise<{ query: (sql: string) => Promise<unknown>; release: () => void }> }, resolvePoolMax: () => number) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const summary = createCliSummary();
  const current = stage(console, summary, "DATABASE", "CONNECTION PREFLIGHT", {
    source: databaseUrl ? "DATABASE_URL" : "missing",
    timeoutMs: 5000,
    poolMax: resolvePoolMax(),
  });

  if (!databaseUrl) {
    const error = new Error("DATABASE_URL is not set");
    current.fail(error);
    throw error;
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    const error = new Error("DATABASE_URL is not a valid PostgreSQL URL");
    current.fail(error);
    throw error;
  }

  printSection(console, "DATABASE", "TARGET", {
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || "(default)",
    database: parsed.pathname.replace(/^\//, "") || "(default)",
    sslMode: parsed.searchParams.get("sslmode") ?? "connection-string/default",
    user: parsed.username || "(not set)",
    password: parsed.password ? "********" : "(not set)",
  });

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    current.complete({ reachable: true, query: "SELECT 1" });
  } catch (error) {
    current.fail(error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const wantsDev = process.argv.includes("--dev");
  const mode = wantsDev ? "dev" : "prod";
  const summary = createCliSummary();

  printBanner(console, "Clara AI Platform — Database Seed");
  printRuntime(console, mode);

  const environmentStage = stage(console, summary, "SEED", "ENVIRONMENT", {
    nodeEnv: process.env.NODE_ENV ?? "(not set)",
    databaseConfigured: process.env.DATABASE_URL ? "yes" : "no",
    adminEmail: process.env.CLARA_ADMIN_EMAIL ?? "admin@clara.ai",
    demoUserEmail: process.env.CLARA_DEMO_USER_EMAIL ?? "demo@clara.ai",
  });
  environmentStage.complete();

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

  const { pool, resolvePoolMax } = await import("../src/lib/db");
  const { seedProductionData } = await import("../src/lib/db/seed/production");
  const { seedDevelopmentData } = await import("../src/lib/db/seed/development");

  try {
    await databasePreflight(pool, resolvePoolMax);
    if (mode === "prod") {
      await seedProductionData();
      printSection(console, "SEED", "LOGIN OUTPUT", {
        platformAdminEmail: process.env.CLARA_ADMIN_EMAIL ?? "admin@clara.ai",
        platformAdminPassword: process.env.CLARA_ADMIN_PASSWORD ? "********" : "(default password)",
        demoUserEmail: process.env.CLARA_DEMO_USER_EMAIL ?? "demo@clara.ai",
        demoUserPassword: process.env.CLARA_DEMO_USER_PASSWORD ? "********" : "(default password)",
        note: "Passwords are intentionally redacted from terminal output.",
      });
    } else {
      await seedDevelopmentData();
      printSection(console, "SEED", "LOGIN OUTPUT", {
        platformAdmin: "admin@clara.ai / ********",
        demoUser: "demo@clara.ai / ******** (Enterprise)",
        omenAdmin: "omen-admin@omeninsurance.com / ******** (Pro)",
        techVisionAdmin: "techvision-admin@techvision.io / ******** (Starter)",
        note: "Passwords are intentionally redacted from terminal output.",
      });
    }
  } catch (error) {
    console.error("\n[SEED][FAILURE] Execution stopped.");
    console.error("  Error class : " + (error instanceof Error ? error.name : "UnknownError"));
    console.error("  Error       : " + (error instanceof Error ? error.message : String(error)));
    printSummary(console, summary, "FAILED");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
