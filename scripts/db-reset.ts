#!/usr/bin/env tsx
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

  if (wantsDev && process.env.NODE_ENV === "production") {
    console.error("[db-reset] refusing --dev reset while NODE_ENV=production");
    process.exit(1);
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
