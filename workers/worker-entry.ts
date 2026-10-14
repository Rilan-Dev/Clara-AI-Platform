import "./all-workers";
import { installEgressDispatcher } from "../src/lib/egress";
import { processNextJob } from "../src/modules/knowledge-bases/worker/ingest-worker";
import { startIngestPoller } from "../src/modules/knowledge-bases/worker/ingest-poller";

const intervalMs = Number.parseInt(process.env.INGEST_WORKER_POLL_INTERVAL_MS ?? "1000", 10);

// Egress policy before the first provider call: the ingest worker embeds
// documents against vendor endpoints and needs the same connect timeout /
// egress-proxy support as the Next server process.
installEgressDispatcher();

const stopIngestPoller = startIngestPoller(processNextJob, {
  intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 1000,
  onResult: (result) => {
    if (result.status === "processed") {
      console.log(
        `[ingest-poller] ✅ document ${result.documentId} processed — ${result.chunkCount} chunks`,
      );
    } else if (result.status === "error") {
      console.error(`[ingest-poller] ❌ ingest job failed: ${result.error}`);
    }
  },
});

const shutdown = () => {
  stopIngestPoller();
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
