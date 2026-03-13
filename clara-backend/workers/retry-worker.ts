/**
 * workers/retry-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BullMQ worker — processes clara-retry jobs.
 *
 * Each job represents one retry attempt for a URL that failed during the
 * main scrape session. The worker:
 *   1. Loads the page with the full multi-strategy waterfall (loadWebPage)
 *   2. On success  → creates document + ingest job → marks URL completed
 *   3. On transient failure → schedules the next retry if under limit
 *   4. On permanent failure → marks URL permanently_failed
 *
 * Error classification:
 *   PERMANENT (no further retry):  hard-block
 *   TRANSIENT (schedule next):     everything else
 */

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../src/modules/queue/redis";
import type { UrlRetryJobData } from "../src/modules/queue/index";
import { getRetryQueue } from "../src/modules/queue/index";
import { loadWebPage, WebLoadError } from "../src/modules/admin/core/ingest/web-loader";
import {
  createDocument,
  createIngestJob,
  findDocumentBySourceUrl,
} from "../src/modules/knowledge-bases/core/documents-db";
import { processJobsById } from "../src/modules/knowledge-bases/worker/ingest-worker";
import { publishScrapeSessionRefresh } from "../src/modules/knowledge-bases/core/scrape-progress-stream";
import { recalcSessionProgress } from "../src/modules/knowledge-bases/core/scrape-sessions-db";
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

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_NAME  = "clara-retry";
const CONCURRENCY = parseInt(process.env.RETRY_WORKER_CONCURRENCY ?? "3", 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withJitter(delayMs: number): number {
  const jitter = delayMs * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delayMs + jitter);
}

function buildRagContent(page: {
  url: string; title: string; text: string; metadata: Record<string, unknown>;
}): string {
  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  lines.push("");
  lines.push(`**Source:** ${page.url}`);
  if (page.metadata?.description) lines.push(`**Description:** ${page.metadata.description}`);
  lines.push(`**Scraped:** ${new Date().toISOString()} (retry)`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(page.text.trim());
  return lines.join("\n");
}

/** Determine if an error is permanent (no further retry is worth trying). */
function isPermanent(errorCode: string, attemptNumber: number): boolean {
  if (PERMANENT_ERROR_CODES.has(errorCode)) return true;
  if (attemptNumber >= MAX_RETRY_ATTEMPTS) return true;
  return false;
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processRetryJob(job: Job<UrlRetryJobData>): Promise<void> {
  const {
    retryRecordId, scrapeUrlId, sessionId, kbId, url, attemptNumber
  } = job.data;

  console.log(
    `[retry-worker] ▶ Job ${job.id} — attempt #${attemptNumber} for ${url}` +
    ` (session=${sessionId})`
  );

  // ── Mark running ──────────────────────────────────────────────────────────
  await Promise.all([
    markRetryRunning(retryRecordId),
    markScrapeUrlRetrying(scrapeUrlId),
  ]);

  try {
    // ── Deduplication: reuse existing ready document ───────────────────────
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

    // ── Fetch the page ─────────────────────────────────────────────────────
    const page = await loadWebPage(url);

    if (!page.text?.trim()) {
      throw new WebLoadError("Page returned no extractable text", "empty-content", true);
    }

    // ── Create document + ingest job ───────────────────────────────────────
    const textContent = buildRagContent(page);
    const base64      = Buffer.from(textContent, "utf-8").toString("base64");
    const fileSize    = Buffer.byteLength(textContent, "utf-8");
    const safeTitle   = (page.title || url).replace(/[^a-z0-9\-_ ]/gi, "_").slice(0, 100);

    const doc = await createDocument({
      kbId,
      title:                  page.title || url,
      originalFilename:       url,
      sourceType:             "url",
      createdByScrapeSessionId: sessionId,
      mimeType:               "text/markdown",
      fileSize,
    });

    const ingestJob = await createIngestJob(doc.id, kbId, {
      base64,
      mimeType: "text/markdown",
      filename: `${safeTitle}.md`,
    });

    // ── Run ingest synchronously (worker context has no time limit) ────────
    await processJobsById([ingestJob.id], {
      shouldStop: async () => false,
      onProgress: async () => {
        await publishScrapeSessionRefresh(sessionId).catch(() => null);
      },
    });

    // ── Mark success ───────────────────────────────────────────────────────
    await Promise.all([
      markRetrySucceeded(retryRecordId),
      markScrapeUrlRetrySucceeded(scrapeUrlId, doc.id),
      recalcSessionProgress(sessionId),
      publishScrapeSessionRefresh(sessionId).catch(() => null),
    ]);

    console.log(
      `[retry-worker] ✅ Job ${job.id} succeeded — ${url}` +
      ` (${page.metadata.scrapeStrategy}, ${page.text.length} chars)`
    );

  } catch (err) {
    const error     = err as Error;
    const errorCode = err instanceof WebLoadError ? err.code : "unknown";
    const message   = `[${errorCode}] ${error.message}`;

    console.error(`[retry-worker] ❌ Job ${job.id} failed (attempt #${attemptNumber}):`, message);

    if (isPermanent(errorCode, attemptNumber)) {
      // No more retries
      await Promise.all([
        markRetryFailed(retryRecordId, errorCode, message, null),
        markScrapeUrlPermanentlyFailed(scrapeUrlId, message),
        publishScrapeSessionRefresh(sessionId).catch(() => null),
      ]);
      console.log(`[retry-worker] ⛔ ${url} permanently failed after ${attemptNumber} retries`);
      return;
    }

    // ── Schedule the next retry ────────────────────────────────────────────
    const nextAttempt  = attemptNumber + 1;
    const baseDelay    = RETRY_DELAY_MS[nextAttempt] ?? RETRY_DELAY_MS[MAX_RETRY_ATTEMPTS]!;
    const delay        = withJitter(baseDelay);
    const nextScheduledAt = new Date(Date.now() + delay);

    const nextRecord = await createUrlRetry({
      scrapeUrlId,
      sessionId,
      kbId,
      url,
      attemptNumber: nextAttempt,
      scheduledAt:   nextScheduledAt,
    });

    const nextPayload: UrlRetryJobData = {
      retryRecordId: nextRecord.id,
      scrapeUrlId,
      sessionId,
      kbId,
      url,
      attemptNumber: nextAttempt,
    };

    const nextJob = await getRetryQueue().add("retry-url", nextPayload, {
      delay,
      jobId: `retry-${scrapeUrlId}-a${nextAttempt}`,
    });

    await setRetryJobId(nextRecord.id, nextJob.id!);

    await Promise.all([
      markRetryFailed(retryRecordId, errorCode, message, nextScheduledAt),
      markScrapeUrlRetryScheduled(scrapeUrlId, nextScheduledAt),
    ]);

    const humanDelay = delay < 60_000
      ? `${Math.round(delay / 1000)}s`
      : `${Math.round(delay / 60_000)}m`;

    console.log(
      `[retry-worker] ⏰ Scheduled retry #${nextAttempt} for ${url} in ${humanDelay}` +
      ` (job=${nextJob.id})`
    );
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<UrlRetryJobData>(QUEUE_NAME, processRetryJob, {
  connection:  redisConnection,
  concurrency: CONCURRENCY,
});

worker.on("completed", (job: Job<UrlRetryJobData>) =>
  console.log(`[retry-worker] Job ${job.id} completed`)
);

worker.on("failed", (job: Job<UrlRetryJobData> | undefined, err: Error) =>
  console.error(
    `[retry-worker] Job ${job?.id} unexpectedly failed (attempt ${job?.attemptsMade}):`,
    err.message
  )
);

worker.on("error", (err: Error) =>
  console.error("[retry-worker] Worker error:", err)
);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

export async function shutdownRetryWorker(): Promise<void> {
  console.log("[retry-worker] Draining and shutting down…");
  await worker.close();
  console.log("[retry-worker] Closed.");
}

console.log(
  `[retry-worker] 🚀 Started — queue=${QUEUE_NAME}  concurrency=${CONCURRENCY}` +
  `  redis=${process.env.REDIS_HOST ?? "redis"}:${process.env.REDIS_PORT ?? "6379"}`
);

export { worker as retryWorker };
