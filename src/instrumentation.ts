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
  return;
}
