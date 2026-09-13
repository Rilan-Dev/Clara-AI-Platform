/**
 * src/instrumentation.node.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Node-runtime-only startup logic (imported from src/instrumentation.ts only
 * when NEXT_RUNTIME === "nodejs" — see that file for why the split exists).
 *
 *   1. Applies all pending DB migrations (idempotent).
 *   2. Runs the subscription lifecycle sweep once, then every 6 hours —
 *      renewal reminders + automatic past_due transitions with owner emails.
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export async function registerNode(): Promise<void> {
  try {
    const { ensureMigrated } = await import("@/lib/db/migrate");
    await ensureMigrated();

    const { sweepSubscriptionExpiry } = await import("@/lib/subscription-expiry");

    // Initial pass — errors never block server startup.
    sweepSubscriptionExpiry().catch((err: unknown) =>
      console.error("[instrumentation] initial subscription sweep failed:", err)
    );

    const timer = setInterval(() => {
      sweepSubscriptionExpiry().catch((err: unknown) =>
        console.error("[instrumentation] periodic subscription sweep failed:", err)
      );
    }, SWEEP_INTERVAL_MS);

    // Don't keep the process alive just for the sweep timer.
    if (typeof timer.unref === "function") timer.unref();
  } catch (err) {
    console.error("[instrumentation] startup failed:", err);
  }
}
