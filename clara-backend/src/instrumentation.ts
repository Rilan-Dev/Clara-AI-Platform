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
  // Only run in the Node.js runtime (not the edge runtime)
  if (import.meta.env.VITE_RUNTIME === "nodejs") {
    console.log("[startup] Running database migrations…");
    try {
      const { runMigrationsOnStartup } = await import("./lib/db/migrate");
      await runMigrationsOnStartup();
      console.log("[startup] Database ready.");
    } catch (err) {
      // Log but don't crash — the error will show in logs and routes will
      // surface proper errors rather than a silent broken server.
      console.error("[startup] Migration error:", err);
    }
  }
}
