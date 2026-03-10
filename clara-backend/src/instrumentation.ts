/**
 * src/instrumentation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js instrumentation hook — runs ONCE when the server process starts,
 * before the first request is handled.
 *
 * This guarantees all DB tables exist on a fresh database without needing
 * to hit an API route first.
 *
 * Enabled via `experimental.instrumentationHook: true` in next.config.ts.
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  console.log("[startup] Running database migrations...");
  try {
    const { runMigrationsOnStartup } = await import("./lib/db/migrate");
    await runMigrationsOnStartup();
    console.log("[startup] Database ready.");
  } catch (err) {
    console.error("[startup] Migration error:", err);
  }
}
