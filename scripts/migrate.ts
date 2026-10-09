#!/usr/bin/env tsx

// Load .env before importing the database module, which requires DATABASE_URL
// during module evaluation. In Vercel, injected environment variables continue
// to work because process.loadEnvFile() is optional.
try {
  process.loadEnvFile();
} catch {
  // .env is optional when environment variables are injected by the runtime.
}

async function main() {
  if (process.env.SKIP_DB_MIGRATIONS === "1") {
    // Skipping migrations in production can publish an application whose
    // request handlers query tables that do not exist yet (including the
    // platform OAuth-app configuration table). Keep local opt-out available,
    // but never let a production/Vercel build silently succeed without schema.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      console.error(
        "[db:migrate] Refusing to skip database migrations in production/Vercel. " +
          "Unset SKIP_DB_MIGRATIONS or apply migrations before building.",
      );
      process.exitCode = 1;
      return;
    }

    console.log("[db:migrate] SKIP_DB_MIGRATIONS=1 — skipped in non-production environment.");
    return;
  }

  const { runMigrationsOnStartup } = await import("../src/lib/db/migrate");

  try {
    await runMigrationsOnStartup();
    console.log("[db:migrate] Database migrations completed successfully.");
  } catch (error) {
    console.error("[db:migrate] Failed:", error);
    process.exitCode = 1;
  }
}

void main();
