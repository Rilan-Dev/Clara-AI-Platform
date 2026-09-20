/**
 * workers/all-workers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Combined entry point that starts ALL Clara background workers in one process.
 *
 * Workers started:
 *   1. crawl-worker   — website discovery via BullMQ clara-crawl queue
 *   2. retry-worker   — failed-URL retry scheduler via clara-retry queue
 *
 * Both workers share the same Redis connection (redisConnection singleton)
 * and the same Node.js process lifecycle. SIGTERM/SIGINT gracefully drains
 * both queues before exiting.
 *
 * Docker service:  clara-worker
 * Dockerfile CMD:  npx tsx --tsconfig tsconfig.worker.json workers/all-workers.ts
 */

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../src/modules/queue/redis";
import type { CrawlJobData } from "../src/modules/queue/index";
import type { UrlRetryJobData } from "../src/modules/queue/index";
import { crawlWebsite } from "../src/modules/ingest/crawlers/web-crawler";
import {
  insertDiscoveredUrls,
  recalcSessionProgress,
  markSessionAwaiting,
  markSessionFailed,
  getSessionById,
} from "../src/modules/knowledge-bases/core/scrape-sessions-db";
import { publishScrapeSessionRefresh } from "../src/modules/knowledge-bases/core/scrape-progress-stream";
import type { CrawlJobProgress } from "../src/modules/queue/index";

// ── Import retry processor directly (avoids duplicate worker instantiation) ───
import { loadWebPage, WebLoadError } from "../src/modules/admin/core/ingest/web-loader";
import {
  createDocument,
  createIngestJob,
  findDocumentBySourceUrl,
} from "../src/modules/knowledge-bases/core/documents-db";
import { processJobsById } from "../src/modules/knowledge-bases/worker/ingest-worker";
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_MS,
  PERMANENT_ERROR_CODES,
  markRetryRunning,
  markRetrySucceeded,
  markRetryFailed,
  createUrlRetry,
  setRetryJobId,
  markScrapeUrlRetrying,
  markScrapeUrlRetrySucceeded,
  markScrapeUrlPermanentlyFailed,
  markScrapeUrlRetryScheduled,
} from "../src/modules/knowledge-bases/core/scrape-url-retry-db";
import { getRetryQueue } from "../src/modules/queue/index";

// ─────────────────────────────────────────────────────────────────────────────
// CRAWL WORKER
// ─────────────────────────────────────────────────────────────────────────────

const CRAWL_CONCURRENCY = parseInt(process.env.CRAWL_WORKER_CONCURRENCY ?? "2", 10);

async function processCrawlJob(job: Job<CrawlJobData>): Promise<void> {
  const { sessionId, url, maxDepth, maxUrls, requestDelayMs, scopeToInputPath } = job.data;
  const t0 = Date.now();
  const buildProgress = (percent: number, urlsFound: number): CrawlJobProgress => ({
    percent, urlsFound, startedAtMs: t0,
  });

  console.log(`[crawl-worker] ▶ Job ${job.id} — session=${sessionId}  url=${url}`);

  const session = await getSessionById(sessionId);
  if (!session || session.status === "failed" || session.cancelRequested) {
    console.warn(`[crawl-worker] Session ${sessionId} no longer active — skipping`);
    return;
  }

  try {
    await job.updateProgress(buildProgress(5, 0));
    await publishScrapeSessionRefresh(sessionId).catch(() => null);

    const crawlResult = await crawlWebsite(url, {
      maxDepth, maxUrls, requestDelayMs,
      concurrency:      3,
      scopeToInputPath: Boolean(scopeToInputPath),
      parseSitemap:     true,
      respectRobotsTxt: true,
      shouldAbort: async () => Boolean((await getSessionById(sessionId))?.cancelRequested),
      onProgress: async ({ totalDiscovered }) => {
        const pct = Math.min(90, Math.round((totalDiscovered / maxUrls) * 90));
        await job.updateProgress(buildProgress(pct, totalDiscovered)).catch(() => null);
        await publishScrapeSessionRefresh(sessionId).catch(() => null);
      },
    });

    await job.updateProgress(buildProgress(92, crawlResult.discoveredUrls.length));
    await publishScrapeSessionRefresh(sessionId).catch(() => null);

    await insertDiscoveredUrls(sessionId,
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
    await publishScrapeSessionRefresh(sessionId).catch(() => null);

    console.log(
      `[crawl-worker] ✅ Job ${job.id} done — ` +
      `${crawlResult.totalPages} pages in ${crawlResult.crawlDurationMs}ms`
    );
  } catch (err) {
    const message = (err as Error).message;
    const current = await getSessionById(sessionId);
    if (message === "Crawl cancelled" || current?.cancelRequested) {
      console.log(`[crawl-worker] ⏹ Job ${job.id} cancelled for session ${sessionId}`);
      await publishScrapeSessionRefresh(sessionId).catch(() => null);
      return;
    }
    console.error(`[crawl-worker] ❌ Job ${job.id} failed:`, message);
    await markSessionFailed(sessionId, `Crawl failed: ${message}`).catch(() => null);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    throw err;
  }
}

const crawlWorker = new Worker<CrawlJobData>("clara-crawl", processCrawlJob, {
  connection: redisConnection, concurrency: CRAWL_CONCURRENCY,
});
crawlWorker.on("completed", (j: Job<CrawlJobData>) => console.log(`[crawl-worker] Job ${j.id} completed`));
crawlWorker.on("failed", (j: Job<CrawlJobData> | undefined, e: Error) =>
  console.error(`[crawl-worker] Job ${j?.id} failed (attempt ${j?.attemptsMade}):`, e.message));
crawlWorker.on("error", (e: Error) => console.error("[crawl-worker] error:", e));

console.log(`[crawl-worker] 🚀 Started — queue=clara-crawl  concurrency=${CRAWL_CONCURRENCY}`);

// ─────────────────────────────────────────────────────────────────────────────
// RETRY WORKER
// ─────────────────────────────────────────────────────────────────────────────

const RETRY_CONCURRENCY = parseInt(process.env.RETRY_WORKER_CONCURRENCY ?? "3", 10);

function withJitter(ms: number): number {
  return Math.round(ms + ms * 0.2 * (Math.random() * 2 - 1));
}

function buildRagContent(page: { url: string; title: string; text: string; metadata: Record<string, unknown> }): string {
  return [
    `# ${page.title}`, "",
    `**Source:** ${page.url}`,
    page.metadata?.description ? `**Description:** ${page.metadata.description}` : null,
    `**Scraped:** ${new Date().toISOString()} (retry)`,
    "", "---", "", page.text.trim(),
  ].filter((l) => l !== null).join("\n");
}

async function processRetryJob(job: Job<UrlRetryJobData>): Promise<void> {
  const { retryRecordId, scrapeUrlId, sessionId, kbId, url, attemptNumber } = job.data;
  console.log(`[retry-worker] ▶ Job ${job.id} — attempt #${attemptNumber} for ${url}`);

  await Promise.all([markRetryRunning(retryRecordId), markScrapeUrlRetrying(scrapeUrlId)]);

  try {
    const existing = await findDocumentBySourceUrl(kbId, url);
    if (existing?.status === "ready") {
      console.log(`[retry-worker] ⏭  Reusing existing doc for ${url}`);
      await Promise.all([
        markRetrySucceeded(retryRecordId),
        markScrapeUrlRetrySucceeded(scrapeUrlId, existing.id),
        recalcSessionProgress(sessionId),
        publishScrapeSessionRefresh(sessionId).catch(() => null),
      ]);
      return;
    }

    const page = await loadWebPage(url);
    if (!page.text?.trim()) throw new WebLoadError("No extractable text", "empty-content", true);

    const textContent = buildRagContent(page);
    const base64      = Buffer.from(textContent, "utf-8").toString("base64");
    const fileSize    = Buffer.byteLength(textContent, "utf-8");
    const safeTitle   = (page.title || url).replace(/[^a-z0-9\-_ ]/gi, "_").slice(0, 100);

    const doc = await createDocument({
      kbId, title: page.title || url, originalFilename: url,
      sourceType: "url", createdByScrapeSessionId: sessionId,
      mimeType: "text/markdown", fileSize,
    });
    const ingestJob = await createIngestJob(doc.id, kbId, {
      base64, mimeType: "text/markdown", filename: `${safeTitle}.md`,
    });
    await processJobsById([ingestJob.id], {
      shouldStop:  async () => false,
      onProgress:  async () => { await publishScrapeSessionRefresh(sessionId).catch(() => null); },
    });

    await Promise.all([
      markRetrySucceeded(retryRecordId),
      markScrapeUrlRetrySucceeded(scrapeUrlId, doc.id),
      recalcSessionProgress(sessionId),
      publishScrapeSessionRefresh(sessionId).catch(() => null),
    ]);
    console.log(`[retry-worker] ✅ Job ${job.id} succeeded — ${url}`);

  } catch (err) {
    const errorCode = err instanceof WebLoadError ? err.code : "unknown";
    const message   = `[${errorCode}] ${(err as Error).message}`;
    console.error(`[retry-worker] ❌ Job ${job.id} failed (attempt #${attemptNumber}):`, message);

    const permanent = PERMANENT_ERROR_CODES.has(errorCode) || attemptNumber >= MAX_RETRY_ATTEMPTS;

    if (permanent) {
      await Promise.all([
        markRetryFailed(retryRecordId, errorCode, message, null),
        markScrapeUrlPermanentlyFailed(scrapeUrlId, message),
        publishScrapeSessionRefresh(sessionId).catch(() => null),
      ]);
      console.log(`[retry-worker] ⛔ ${url} permanently failed after ${attemptNumber} retries`);
      return;
    }

    // Schedule next retry
    const nextAttempt = attemptNumber + 1;
    const delay       = withJitter(RETRY_DELAY_MS[nextAttempt] ?? RETRY_DELAY_MS[MAX_RETRY_ATTEMPTS]!);
    const nextAt      = new Date(Date.now() + delay);

    const nextRecord = await createUrlRetry({ scrapeUrlId, sessionId, kbId, url, attemptNumber: nextAttempt, scheduledAt: nextAt });
    const nextJob    = await getRetryQueue().add("retry-url", {
      retryRecordId: nextRecord.id, scrapeUrlId, sessionId, kbId, url, attemptNumber: nextAttempt,
    }, { delay, jobId: `retry-${scrapeUrlId}-a${nextAttempt}` });
    await setRetryJobId(nextRecord.id, nextJob.id!);
    await Promise.all([
      markRetryFailed(retryRecordId, errorCode, message, nextAt),
      markScrapeUrlRetryScheduled(scrapeUrlId, nextAt),
      publishScrapeSessionRefresh(sessionId).catch(() => null),
    ]);
    console.log(`[retry-worker] ⏰ Next retry #${nextAttempt} for ${url} in ${Math.round(delay/60_000)}m`);
  }
}

const retryWorker = new Worker<UrlRetryJobData>("clara-retry", processRetryJob, {
  connection: redisConnection, concurrency: RETRY_CONCURRENCY,
});
retryWorker.on("completed", (j: Job<UrlRetryJobData>) => console.log(`[retry-worker] Job ${j.id} completed`));
retryWorker.on("failed", (j: Job<UrlRetryJobData> | undefined, e: Error) =>
  console.error(`[retry-worker] Job ${j?.id} failed:`, e.message));
retryWorker.on("error", (e: Error) => console.error("[retry-worker] error:", e));

console.log(`[retry-worker] 🚀 Started — queue=clara-retry  concurrency=${RETRY_CONCURRENCY}`);

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown — drains both queues before exiting
// ─────────────────────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[all-workers] ${signal} — draining queues…`);
  await Promise.all([crawlWorker.close(), retryWorker.close()]);
  console.log("[all-workers] All workers closed. Bye.");
  process.exit(0);
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT",  () => { void shutdown("SIGINT");  });
