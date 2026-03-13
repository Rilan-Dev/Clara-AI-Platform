/**
 * src/modules/queue/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ Queue definitions for the Clara background job system.
 *
 * Queues:
 *   clara:crawl   — website discovery (crawlWebsite). Takes 2-10 min per job.
 *                   Triggered by POST /api/kbs/:kbId/scrape/discover.
 *
 * The actual Worker instances live in workers/crawl-worker.ts, which runs as
 * a separate Docker service (clara-worker).  The Next.js API only uses the
 * Queue producer side here.
 */

import { Queue } from "bullmq";
import { redisConnection } from "./redis";

// ── Job payload types ─────────────────────────────────────────────────────────

/** Payload enqueued by POST /api/kbs/:kbId/scrape/discover */
export type CrawlJobData = {
  sessionId:       string;
  kbId:            string;
  url:             string;
  maxDepth:        number;
  maxUrls:         number;
  requestDelayMs:  number;
  scopeToInputPath: boolean;
};

export type CrawlJobProgress = {
  percent: number;
  urlsFound: number;
  startedAtMs: number;
};

let crawlQueue: Queue<CrawlJobData> | null = null;

export function getCrawlQueue(): Queue<CrawlJobData> {
  if (!crawlQueue) {
    crawlQueue = new Queue<CrawlJobData>("clara-crawl", {
      connection: redisConnection,
      defaultJobOptions: {
        /** Remove completed jobs after 1 hour — keeps Redis lean */
        removeOnComplete: { age: 3600 },
        /** Keep failed jobs for 24 h for debugging */
        removeOnFail: { age: 86_400 },
        /** 3 attempts with exponential back-off before giving up */
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
      },
    });
  }

  return crawlQueue;
}
