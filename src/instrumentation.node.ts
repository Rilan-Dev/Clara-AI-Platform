/**
 * src/instrumentation.node.ts
 * Node-runtime-only startup logic.
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function registerNode(): Promise<void> {
  try {
    const { env } = await import("@/lib/env");
    if (env.NODE_ENV === "production") {
      console.info(
        `[instrumentation] env validated (provider=${env.AI_PROVIDER}, app=${env.NEXT_PUBLIC_APP_URL})`
      );
    }
  } catch (err) {
    console.error("[instrumentation] FATAL — refusing to start:", (err as Error).message);
    process.exit(1);
  }

  try {
    const { loadRuntimeSettingsOnStartup } = await import("@/lib/db/migrate");
    await loadRuntimeSettingsOnStartup();

    // Vercel horizontally scales function instances. Persistent pollers and
    // scheduled DB maintenance must run on a dedicated worker/cron runtime.
    if (process.env.VERCEL) {
      console.info("[instrumentation] Vercel runtime: background DB workers disabled");
      return;
    }

    startIngestPollerIfEnabled().catch((err: unknown) =>
      console.error("[instrumentation] ingest poller failed to start:", err)
    );

    const { sweepSubscriptionExpiry } = await import("@/lib/subscription-expiry");
    sweepSubscriptionExpiry().catch((err: unknown) =>
      console.error("[instrumentation] initial subscription sweep failed:", err)
    );

    const timer = setInterval(() => {
      sweepSubscriptionExpiry().catch((err: unknown) =>
        console.error("[instrumentation] periodic subscription sweep failed:", err)
      );
    }, SWEEP_INTERVAL_MS);

    if (typeof timer.unref === "function") timer.unref();
  } catch (err) {
    console.error("[instrumentation] startup failed:", err);
  }
}

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
    if (running) return;
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

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  if (typeof timer.unref === "function") timer.unref();

  console.log(
    `[ingest-poller] background ingest queue poller started ` +
      `(interval=${intervalMs}ms, maxJobsPerTick=${maxJobsPerTick})`
  );
}
