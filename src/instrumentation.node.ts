/**
 * src/instrumentation.node.ts
 * Node-runtime-only startup logic.
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function registerNode(): Promise<void> {
  // Egress policy first: every provider SDK call in this process (Gemini
  // embeddings, OpenAI catalogue, ElevenLabs discovery, health probes)
  // inherits the dispatcher installed here — tunable connect timeout
  // (EGRESS_CONNECT_TIMEOUT_MS) and optional HTTPS_PROXY egress routing.
  try {
    const { installEgressDispatcher } = await import("@/lib/egress");
    installEgressDispatcher();
  } catch (err) {
    console.error("[instrumentation] egress dispatcher install failed — using Node defaults:", (err as Error).message);
  }

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
    const { loadRuntimeSettingsOnStartup, runMigrationsOnStartup } = await import("@/lib/db/migrate");
    // Self-hosted: apply pending schema migrations before serving (one
    // process, advisory-locked, already-applied files are skipped). Vercel
    // applies them in the build step instead (see vercel.json buildCommand).
    const migrateOnStart =
      !process.env.VERCEL && (process.env.RUN_MIGRATIONS_ON_START ?? "true").toLowerCase() !== "false";
    let schemaReady = false;
    if (migrateOnStart) {
      try {
        await runMigrationsOnStartup();
        schemaReady = true;
      } catch (err) {
        // Keep serving HTTP so operators can inspect the System Status page,
        // but do not launch background consumers against a partial schema.
        console.error("[instrumentation] database migrations FAILED — schema may be out of date:", err);
        await loadRuntimeSettingsOnStartup();
      }
    } else {
      await loadRuntimeSettingsOnStartup();
    }

    // Vercel horizontally scales function instances. Persistent pollers and
    // scheduled DB maintenance must run on a dedicated worker/cron runtime.
    if (process.env.VERCEL) {
      console.info("[instrumentation] Vercel runtime: background DB workers disabled");
      return;
    }

    // Do not let pollers/cron/sweeps hammer a database whose required
    // migrations failed or were explicitly disabled. HTTP remains available
    // for diagnosis; a restart after correcting the migration issue retries.
    if (!schemaReady) {
      console.error(
        "[instrumentation] background DB workers disabled because schema migrations did not complete",
      );
      return;
    }

    // Self-hosted: run the vercel.json crons in-process (Vercel Cron does
    // not exist here).
    const { startLocalCron } = await import("@/lib/local-cron");
    startLocalCron();

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
      // Knowledge-index re-index jobs advance in the same background loop
      // (lease-protected, resumable — see modules/knowledge-bases/core/reindex).
      await import("@/modules/knowledge-bases/core/reindex")
        .then(({ advanceAllReindexJobs }) => advanceAllReindexJobs(Math.max(intervalMs * 3, 10_000)))
        .catch((err: unknown) => console.error("[reindex] background advance failed:", (err as Error).message));
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
