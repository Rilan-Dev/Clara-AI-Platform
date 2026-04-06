/**
 * workers/retry-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Worker for retrying failed scrape URLs with exponential backoff.
 * 
 * This worker picks up jobs from 'clara-retry'. Each job represents a scheduled
 * retry attempt for a specific scrape_url row.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../src/modules/queue/redis";
import { getRetryQueue, type UrlRetryJobData } from "../src/modules/queue/index";
import { loadWebPage, WebLoadError } from "../src/modules/admin/core/ingest/web-loader";
import {
  createDocument,
  createIngestJob,
  findDocumentBySourceUrl,
} from "../src/modules/knowledge-bases/core/documents-db";
import {
  markRetryRunning,
  markRetrySucceeded,
  markRetryFailed,
  markScrapeUrlRetrying,
  markScrapeUrlRetrySucceeded,
  markScrapeUrlRetryScheduled,
  markScrapeUrlPermanentlyFailed,
  createUrlRetry,
  RETRY_DELAY_MS,
  MAX_RETRY_ATTEMPTS,
  PERMANENT_ERROR_CODES,
} from "../src/modules/knowledge-bases/core/scrape-url-retry-db";
import {
  recalcSessionProgress,
  getSessionById,
} from "../src/modules/knowledge-bases/core/scrape-sessions-db";
import { publishScrapeSessionRefresh } from "../src/modules/knowledge-bases/core/scrape-progress-stream";

const QUEUE_NAME = "clara-retry";

async function processRetryJob(job: Job<UrlRetryJobData>): Promise<void> {
  const { retryRecordId, scrapeUrlId, sessionId, kbId, url, attemptNumber } = job.data;

  console.log(`[retry-worker] ▶ Attempt ${attemptNumber} — ${url}`);

  // 1. Session sanity check
  const session = await getSessionById(sessionId);
  if (!session || session.status === "failed" || session.cancelRequested) {
    console.warn(`[retry-worker] Session ${sessionId} no longer active — marking retry as failed (cancelled)`);
    await markRetryFailed(retryRecordId, "session-inactive", "Session was cancelled or failed", null);
    return;
  }

  try {
    // 2. Already finished check (defensive)
    const existing = await findDocumentBySourceUrl(kbId, url);
    if (existing?.status === "ready") {
      await markRetrySucceeded(retryRecordId);
      await markScrapeUrlRetrySucceeded(scrapeUrlId, existing.id);
      await recalcSessionProgress(sessionId);
      await publishScrapeSessionRefresh(sessionId);
      return;
    }

    // 3. Mark active
    await markRetryRunning(retryRecordId);
    await markScrapeUrlRetrying(scrapeUrlId);
    await publishScrapeSessionRefresh(sessionId);

    // 4. Perform load
    const page = await loadWebPage(url);
    
    // 5. Success integration
    const lines: string[] = [];
    lines.push(`# ${page.title}`);
    lines.push("");
    lines.push(`**Source:** ${page.url}`);
    lines.push(`**Scraped (Retry ${attemptNumber}):** ${new Date().toISOString()}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(page.text.trim());
    
    const textContent = lines.join("\n");
    const fileSize = Buffer.byteLength(textContent, "utf-8");
    const base64 = Buffer.from(textContent, "utf-8").toString("base64");
    const safeTitle = (page.title || url).replace(/[^a-z0-9\-_ ]/gi, "_").slice(0, 100);
    const filename = `${safeTitle}.md`;

    const doc = await createDocument({
      kbId,
      title: page.title || url,
      originalFilename: url,
      sourceType: "url",
      createdByScrapeSessionId: sessionId,
      mimeType: "text/markdown",
      fileSize,
    });

    await createIngestJob(doc.id, kbId, {
      base64,
      mimeType: "text/markdown",
      filename,
    });

    await markRetrySucceeded(retryRecordId);
    await markScrapeUrlRetrySucceeded(scrapeUrlId, doc.id);
    await recalcSessionProgress(sessionId);
    await publishScrapeSessionRefresh(sessionId);
    
    console.log(`[retry-worker] ✅ Successfully recovered ${url}`);

  } catch (err) {
    const error = err as Error;
    const code = error instanceof WebLoadError ? error.code : "unexpected";
    const message = error.message;

    console.error(`[retry-worker] ❌ Attempt ${attemptNumber} failed for ${url}:`, message);

    // 6. Reschedule or permanent fail
    const isPermanent = PERMANENT_ERROR_CODES.has(code);
    const canRetry = !isPermanent && attemptNumber < MAX_RETRY_ATTEMPTS;

    if (canRetry) {
      const nextAttempt = attemptNumber + 1;
      const delayMs = RETRY_DELAY_MS[nextAttempt] || 3_600_000;
      const nextRetryAt = new Date(Date.now() + delayMs);

      // Create the NEXT retry record
      const nextRetry = await createUrlRetry({
        scrapeUrlId,
        sessionId,
        kbId,
        url,
        attemptNumber: nextAttempt,
        scheduledAt: nextRetryAt,
      });

      // Update current record and URL status
      await markRetryFailed(retryRecordId, code, message, nextRetryAt);
      await markScrapeUrlRetryScheduled(scrapeUrlId, nextRetryAt);

      // Enqueue in BullMQ
      const retryJob = await getRetryQueue().add(
        `retry-${scrapeUrlId}-${nextAttempt}`,
        {
          retryRecordId: nextRetry.id,
          scrapeUrlId,
          sessionId,
          kbId,
          url,
          attemptNumber: nextAttempt,
        },
        { delay: delayMs }
      );

      console.log(`[retry-worker] ↻ Scheduled attempt ${nextAttempt} in ${delayMs / 1000}s (jobId: ${retryJob.id})`);
    } else {
      // PERMANENT FAILURE
      const finalMsg = isPermanent 
        ? `Permanent failure (${code}): ${message}`
        : `Maximum retries (${MAX_RETRY_ATTEMPTS}) reached. Last error: [${code}] ${message}`;

      await markRetryFailed(retryRecordId, code, message, null);
      await markScrapeUrlPermanentlyFailed(scrapeUrlId, finalMsg);
      
      console.log(`[retry-worker] ⛔ ${url} marked as permanently failed`);
    }

    await recalcSessionProgress(sessionId);
    await publishScrapeSessionRefresh(sessionId);
  }
}

const worker = new Worker<UrlRetryJobData>(QUEUE_NAME, processRetryJob, {
  connection: redisConnection,
  concurrency: 2, // Low concurrency to avoid bot detection during retry
});

worker.on("completed", (job) => console.log(`[retry-worker] Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[retry-worker] Job ${job?.id} failed:`, err.message));

console.log(`[retry-worker] 🚀 Started — queue=${QUEUE_NAME}`);
