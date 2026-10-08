#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
/**
 * scripts/db-reset.ts — destructive: drop the public schema, re-run the clean
 * migration baseline, and seed.
 *
 *   tsx scripts/db-reset.ts              reset + production seed
 *   tsx scripts/db-reset.ts --dev        reset + development seed (local only)
 *   tsx scripts/db-reset.ts --no-seed    reset + migrations only
 *
 * Optional Qdrant cleanup: pass --clean-qdrant to also delete every KB
 * collection (except the document catalog) so vector storage matches the
 * freshly emptied database.
 */

// Load .env (Node >= 20.12) BEFORE importing the db pool, which reads
// POSTGRES_* at module-evaluation time.
try { process.loadEnvFile(); } catch { /* .env optional */ }

function validateMigrationFiles(): void {
  const migrationsDir = path.join(process.cwd(), "src", "lib", "db", "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const numbers = files.map((file) => file.split("_")[0]);
  const duplicates = [...new Set(
    numbers.filter((number, index) => numbers.indexOf(number) !== index),
  )];

  if (duplicates.length > 0) {
    throw new Error(
      `[db-reset] duplicate migration numbers detected before destructive reset: ${duplicates.join(", ")}`,
    );
  }

  console.log(`[db-reset] migration preflight passed — ${files.length} migration files, unique numeric prefixes`);
}

async function cleanQdrant(): Promise<void> {
  const url = process.env.QDRANT_URL?.replace(/"/g, "");
  if (!url) {
    console.log("[db-reset] QDRANT_URL not set — skipping vector cleanup");
    return;
  }
  const apiKey = process.env.QDRANT_API_KEY ?? "";
  const headers: Record<string, string> = apiKey ? { "api-key": apiKey } : {};

  const res = await fetch(`${url}/collections`, { headers });
  const data = (await res.json()) as { result?: { collections?: { name: string }[] } };
  const collections = data.result?.collections ?? [];

  for (const { name } of collections) {
    if (name === "document_catalog") continue; // platform catalog, not tenant data
    const del = await fetch(`${url}/collections/${name}`, { method: "DELETE", headers });
    console.log(`[db-reset] qdrant ${name} → ${del.ok ? "deleted" : `kept (${del.status})`}`);
  }
}

async function main() {
  const wantsDev = process.argv.includes("--dev");
  const wantsNoSeed = process.argv.includes("--no-seed");
  const wantsQdrantClean = process.argv.includes("--clean-qdrant");

  // Validate the migration set before opening the DB or performing any destructive operation.
  validateMigrationFiles();

  if (wantsDev) {
    // Destructive + demo data: same hardened guard as the demo seeder —
    // explicit NODE_ENV, local DB host (or --force for a remote shared dev DB).
    const { checkDemoSeedAllowed, formatDemoSeedRefusal } = await import("../src/lib/db/seed/demo-guard");
    const check = checkDemoSeedAllowed();
    if (!check.allowed) {
      console.error(formatDemoSeedRefusal(check));
      process.exit(1);
    }
  }

  const { pool } = await import("../src/lib/db");
  const { runMigrationsOnStartup } = await import("../src/lib/db/migrate");
  const { seedProductionData } = await import("../src/lib/db/seed/production");
  const { seedDevelopmentData } = await import("../src/lib/db/seed/development");

  console.log("[db-reset] dropping public schema …");
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  console.log("[db-reset] schema dropped and recreated");

  if (wantsQdrantClean) {
    await cleanQdrant();
  }

  console.log("[db-reset] applying migrations …");
  await runMigrationsOnStartup();

  try {
    if (wantsNoSeed) {
      console.log("[db-reset] done (no seed)");
    } else if (wantsDev) {
      await seedDevelopmentData();
      console.log("[db-reset] done (development seed)");
    } else {
      await seedProductionData();
      console.log("[db-reset] done (production seed)");
    }
  } finally {
    await pool.end();
  }
}

main()
  .catch((error) => {
    console.error("[db-reset] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => { /* pool closed inside main */ });
