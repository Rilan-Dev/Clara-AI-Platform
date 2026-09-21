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
