import { seedDemoData } from "@/lib/db/seed/demo";

/**
 * Development seed — legacy entry point kept for compatibility with
 * `scripts/seed.ts --dev` and `scripts/db-reset.ts --dev`.
 *
 * The Phase 5 demo dataset now lives in `@/lib/db/seed/demo` (demo tenants
 * with the plan-specified logins, sample documents through the real ingest
 * pipeline, deterministic synthetic analytics). This module simply delegates
 * so older invocations keep working with the richer dataset.
 *
 * NEVER run this against a production database. Every CLI path that reaches
 * this function (`scripts/seed.ts --dev`, `scripts/db-reset.ts --dev`) is
 * guarded by `@/lib/db/seed/demo-guard` — explicit NODE_ENV, local DB host,
 * `--force` only for a deliberate shared dev database.
 */
export async function seedDevelopmentData(options?: { logger?: Console }) {
  await seedDemoData(options);
}
