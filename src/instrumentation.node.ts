/**
 * src/instrumentation.node.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Node-runtime-only startup logic (imported from src/instrumentation.ts only
 * when NEXT_RUNTIME === "nodejs" — see that file for why the split exists).
 *
 *   1. Applies all pending DB migrations (idempotent).
 *   2. Starts the background ingest poller — pending / retried / recovered
 *      ingest_jobs are claimed and processed automatically every few seconds.
 *      This replaces the fragile "HTTP self-trigger after upload" pattern
 *      which failed inside Docker networks ("fetch failed") and left jobs
 *      unprocessed forever. Set INGEST_POLLER_ENABLED=false to disable.
 *   3. Runs the subscription lifecycle sweep once, then every 6 hours —
 *      renewal reminders + automatic past_due transitions with owner emails.
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export async function registerNode(): Promise<void> {
  try {
    const { ensureMigrated } = await import("@/lib/db/migrate");
    await ensureMigrated();

    startIngestPollerIfEnabled().catch((err: unknown) =>
      console.error("[instrumentation] ingest poller failed to start:", err)
    );

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

/**
 * Background loop for the PostgreSQL-backed ingest queue.
 *
 * Each cycle runs one maintenance pass: recover stale 'running' jobs, fail
 * orphaned 'processing' documents, then drain up to MAX_JOBS_PER_TICK pending
 * jobs. The DB claim uses FOR UPDATE SKIP LOCKED, so the poller can safely run
 * alongside HTTP drains (/api/worker/ingest) and other replicas.
 */
async function startIngestPollerIfEnabled(): Promise<void> {
  const enabled = (process.env.INGEST_POLLER_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("[instrumentation] ingest poller disabled via INGEST_POLLER_ENABLED=false");
    return;
  }

  const intervalMs = (() => {
    const v = Number(process.env.INGEST_POLLER_INTERVAL_MS ?? "3000");
    return Number.isFinite(v) && v >= 500 ? v : 3000;
  })();
  const maxJobsPerTick = (() => {
    const v = Number(process.env.INGEST_POLLER_MAX_JOBS ?? "5");
    return Number.isFinite(v) && v > 0 ? v : 5;
  })();

  const { runIngestMaintenance } = await import(
    "@/modules/knowledge-bases/worker/ingest-worker"
  );

  let running = false;
  const tick = async () => {
    if (running) return; // single-flight: never overlap cycles
    running = true;
    try {
      const stats = await runIngestMaintenance(maxJobsPerTick);
      if (stats.processed > 0 || stats.errors > 0 || stats.recoveredJobs > 0) {
        console.log(
          `[ingest-poller] processed=${stats.processed} errors=${stats.errors} ` +
            `recoveredJobs=${stats.recoveredJobs} recoveredDocs=${stats.recoveredDocuments}`
        );
      }
    } catch (err) {
      console.error("[ingest-poller] cycle failed:", (err as Error).message);
    } finally {
      running = false;
    }
  };

  // First pass immediately — recovers any queue left over from a restart.
  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(
    `[ingest-poller] background ingest queue poller started ` +
      `(interval=${intervalMs}ms, maxJobsPerTick=${maxJobsPerTick})`
  );
}
