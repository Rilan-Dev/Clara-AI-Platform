/**
 * src/instrumentation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js instrumentation hook — runs ONCE when the server process starts,
 * before the first request is handled.
 *
 *   1. Applies all pending DB migrations (idempotent).
 *   2. Runs the subscription expiry sweep once, then every 6 hours —
 *      renewal reminders + automatic past_due transitions with owner emails.
 *
 * Enabled via `experimental.instrumentationHook: true` in next.config.ts.
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export async function register() {
  // Only run in the Node.js server runtime (not edge / not build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SUBSCRIPTION_SWEEP_DISABLED === "true") return;

  try {
    const { ensureMigrated } = await import("@/lib/db/migrate");
    await ensureMigrated();

    const { sweepSubscriptionExpiry } = await import("@/lib/subscription-expiry");

    // Initial pass — errors never block server startup.
    sweepSubscriptionExpiry().catch((err) =>
      console.error("[instrumentation] initial subscription sweep failed:", err)
    );

    const timer = setInterval(() => {
      sweepSubscriptionExpiry().catch((err) =>
        console.error("[instrumentation] periodic subscription sweep failed:", err)
      );
    }, SWEEP_INTERVAL_MS);

    // Don't keep the process alive just for the sweep timer.
    if (typeof timer.unref === "function") timer.unref();
  } catch (err) {
    console.error("[instrumentation] startup failed:", err);
  }
}
