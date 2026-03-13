/**
 * src/modules/queue/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ Queue definitions for the Clara background job system.
 *
 * Queues:
 *   clara-crawl   — website discovery (crawlWebsite). 2-10 min per job.
 *                   Producer: POST /api/kbs/:kbId/scrape/discover
 *                   Consumer: workers/crawl-worker.ts
 *
 *   clara-retry   — failed scrape URL retries (exponential back-off).
 *                   Enqueued by: scheduleFailedUrlRetries() at end of scrape session.
 *                   Consumer: workers/retry-worker.ts
 *                   Schedule:  attempt 1 → 5 min, 2 → 30 min, 3 → 2 hr
 *
 * Workers live in workers/  and run as the clara-worker Docker service.
 * The Next.js API only uses the Queue producer side here.
 */

import { Queue } from "bullmq";
import { redisConnection } from "./redis";

// ── Crawl queue ───────────────────────────────────────────────────────────────

/** Payload enqueued by POST /api/kbs/:kbId/scrape/discover */
export type CrawlJobData = {
  sessionId:        string;
  kbId:             string;
  url:              string;
  maxDepth:         number;
  maxUrls:          number;
  requestDelayMs:   number;
  scopeToInputPath: boolean;
};

export type CrawlJobProgress = {
  percent:     number;
  urlsFound:   number;
  startedAtMs: number;
};

let _crawlQueue: Queue<CrawlJobData> | null = null;

export function getCrawlQueue(): Queue<CrawlJobData> {
  if (!_crawlQueue) {
    _crawlQueue = new Queue<CrawlJobData>("clara-crawl", {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: { age: 3_600 },       // keep completed 1 hr
        removeOnFail:     { age: 86_400 },       // keep failed 24 hr for debug
        attempts:         3,
        backoff:          { type: "exponential", delay: 5_000 },
      },
    });
  }
  return _crawlQueue;
}

// ── Retry queue ───────────────────────────────────────────────────────────────

/**
 * Payload for a single failed-URL retry job.
 *
 * retryRecordId   — scrape_url_retries.id (used by worker to update status)
 * scrapeUrlId     — scrape_urls.id (used to mark completed/failed on the URL row)
 * sessionId       — scrape_sessions.id
 * kbId            — knowledge_bases.id
 * url             — the page URL to re-scrape
 * attemptNumber   — which retry this is (1 | 2 | 3)
 */
export type UrlRetryJobData = {
  retryRecordId:  string;
  scrapeUrlId:    string;
  sessionId:      string;
  kbId:           string;
  url:            string;
  attemptNumber:  number;
};

let _retryQueue: Queue<UrlRetryJobData> | null = null;

export function getRetryQueue(): Queue<UrlRetryJobData> {
  if (!_retryQueue) {
    _retryQueue = new Queue<UrlRetryJobData>("clara-retry", {
      connection: redisConnection,
      defaultJobOptions: {
        // Each job is already a scheduled retry — do NOT auto-retry on worker crash.
        // The worker handles its own re-scheduling logic.
        attempts:         1,
        removeOnComplete: { age: 7_200 },       // keep 2 hr
        removeOnFail:     { age: 7 * 86_400 },  // keep 7 days for debugging
      },
    });
  }
  return _retryQueue;
}
