/**
 * workers/crawl-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ worker — processes clara:crawl jobs.
 *
 * This file runs as a standalone Node.js process (NOT inside Next.js):
 *   docker service: clara-worker
 *   command:        npx tsx --tsconfig tsconfig.worker.json workers/crawl-worker.ts
 *
 * Lifecycle per job:
 *   1. Receive CrawlJobData { sessionId, url, maxDepth, ... }
 *   2. Run crawlWebsite() — can take 2-10 minutes, no HTTP timeout
 *   3. Insert discovered URLs into scrape_urls table
 *   4. Transition session: 'discovering' → 'awaiting_confirmation'
 *   5. On error: transition session to 'failed', re-throw (BullMQ retries)
 */

// ── Path alias bootstrap ──────────────────────────────────────────────────────
// tsx + tsconfig.worker.json handles @/ → ./src/ resolution at runtime.

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../src/modules/queue/redis";
import type { CrawlJobData, CrawlJobProgress } from "../src/modules/queue/index";
import { crawlWebsite } from "../src/modules/ingest/crawlers/web-crawler";
import {
  insertDiscoveredUrls,
  recalcSessionProgress,
  markSessionAwaiting,
  markSessionFailed,
  getSessionById,
} from "../src/modules/knowledge-bases/core/scrape-sessions-db";

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_NAME  = "clara-crawl";
const CONCURRENCY = parseInt(process.env.CRAWL_WORKER_CONCURRENCY ?? "2", 10);

// ── Job processor ─────────────────────────────────────────────────────────────

async function processCrawlJob(job: Job<CrawlJobData>): Promise<void> {
  const { sessionId, url, maxDepth, maxUrls, requestDelayMs, scopeToInputPath } = job.data;
  const discoveryStartedAtMs = Date.now();
  const buildProgress = (percent: number, urlsFound: number): CrawlJobProgress => ({
    percent,
    urlsFound,
    startedAtMs: discoveryStartedAtMs,
  });

  console.log(`[crawl-worker] ▶ Job ${job.id} — session=${sessionId}  url=${url}`);

  // Abort early if session was cancelled externally
  const session = await getSessionById(sessionId);
  if (!session || session.status === "failed") {
    console.warn(`[crawl-worker] Session ${sessionId} no longer active — skipping`);
    return;
  }

  try {
    // ── Update job progress so BullMQ dashboard can show percentage ──────────
    await job.updateProgress(buildProgress(5, 0));

    const crawlResult = await crawlWebsite(url, {
      maxDepth,
      maxUrls,
      requestDelayMs,
      concurrency:      3,
      scopeToInputPath: Boolean(scopeToInputPath),
      parseSitemap:     true,
      respectRobotsTxt: true,
      onProgress: async ({ totalDiscovered }) => {
        // Report progress as % of maxUrls (capped at 90 — rest is DB write)
        const pct = Math.min(90, Math.round((totalDiscovered / maxUrls) * 90));
        await job.updateProgress(buildProgress(pct, totalDiscovered)).catch(() => null);
      },
    });

    await job.updateProgress(buildProgress(92, crawlResult.discoveredUrls.length));

    await insertDiscoveredUrls(
      sessionId,
      crawlResult.discoveredUrls.map((u) => ({
        url:           u.url,
        title:         u.title,
        depth:         u.depth,
        parentUrl:     u.parentUrl ?? undefined,
        contentLength: u.contentLength,
      }))
    );

    await job.updateProgress(buildProgress(96, crawlResult.discoveredUrls.length));
    await recalcSessionProgress(sessionId);
    await markSessionAwaiting(sessionId);
    await job.updateProgress(buildProgress(100, crawlResult.discoveredUrls.length));

    console.log(
      `[crawl-worker] ✅ Job ${job.id} done — ` +
      `${crawlResult.totalPages} pages in ${crawlResult.crawlDurationMs}ms`
    );

  } catch (err) {
    const message = (err as Error).message;
    console.error(`[crawl-worker] ❌ Job ${job.id} failed:`, message);
    await markSessionFailed(sessionId, `Crawl failed: ${message}`).catch(() => null);
    throw err; // BullMQ will retry according to defaultJobOptions.attempts
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<CrawlJobData>(QUEUE_NAME, processCrawlJob, {
  connection:  redisConnection,
  concurrency: CONCURRENCY,
});

worker.on("completed", (job: Job<CrawlJobData>) =>
  console.log(`[crawl-worker] Job ${job.id} completed`)
);

worker.on("failed", (job: Job<CrawlJobData> | undefined, err: Error) =>
  console.error(`[crawl-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
);

worker.on("error", (err: Error) =>
  console.error("[crawl-worker] Worker error:", err)
);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[crawl-worker] ${signal} received — draining queue and shutting down`);
  await worker.close();
  console.log("[crawl-worker] Worker closed. Bye.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

console.log(
  `[crawl-worker] 🚀 Started — queue=${QUEUE_NAME}  concurrency=${CONCURRENCY}` +
  `  redis=${process.env.REDIS_HOST ?? "redis"}:${process.env.REDIS_PORT ?? "6379"}`
);
