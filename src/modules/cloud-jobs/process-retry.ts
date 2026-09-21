import { loadWebPage, WebLoadError } from "@/modules/admin/core/ingest/web-loader";
import { createDocument, createIngestJob, findDocumentBySourceUrl } from "@/modules/knowledge-bases/core/documents-db";
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
} from "@/modules/knowledge-bases/core/scrape-url-retry-db";
import { recalcSessionProgress, getSessionById } from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { publishScrapeSessionRefresh } from "@/modules/knowledge-bases/core/scrape-progress-stream";
import { enqueueIngestJob, enqueueRetryJob } from "@/modules/cloud-jobs/queue";

export type CloudRetryJob = {
  retryRecordId: string;
  scrapeUrlId: string;
  sessionId: string;
  kbId: string;
  url: string;
  attemptNumber: number;
};

export async function processRetryJobData(job: CloudRetryJob): Promise<void> {
  const { retryRecordId, scrapeUrlId, sessionId, kbId, url, attemptNumber } = job;

  const session = await getSessionById(sessionId);
  if (!session || session.status === "failed" || session.cancelRequested) {
    await markRetryFailed(retryRecordId, "session-inactive", "Session was cancelled or failed", null);
    return;
  }

  try {
    const existing = await findDocumentBySourceUrl(kbId, url);
    if (existing?.status === "ready") {
      await markRetrySucceeded(retryRecordId);
      await markScrapeUrlRetrySucceeded(scrapeUrlId, existing.id);
      await recalcSessionProgress(sessionId);
      await publishScrapeSessionRefresh(sessionId).catch(() => null);
      return;
    }

    await markRetryRunning(retryRecordId);
    await markScrapeUrlRetrying(scrapeUrlId);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);

    const page = await loadWebPage(url);
    const lines = [
      `# ${page.title}`,
      "",
      `**Source:** ${page.url}`,
      `**Scraped (Retry ${attemptNumber}):** ${new Date().toISOString()}`,
      "",
      "---",
      "",
      page.text.trim(),
    ];
    const textContent = lines.join("\n");
    const safeTitle = (page.title || url).replace(/[^a-z0-9\-_ ]/gi, "_").slice(0, 100);
    const filename = `${safeTitle}.md`;

    const doc = await createDocument({
      kbId,
      title: page.title || url,
      originalFilename: url,
      sourceType: "url",
      createdByScrapeSessionId: sessionId,
      mimeType: "text/markdown",
      fileSize: Buffer.byteLength(textContent, "utf-8"),
    });

    const ingestJob = await createIngestJob(doc.id, kbId, {
      base64: Buffer.from(textContent, "utf-8").toString("base64"),
      mimeType: "text/markdown",
      filename,
    });
    await enqueueIngestJob(ingestJob.id);

    await markRetrySucceeded(retryRecordId);
    await markScrapeUrlRetrySucceeded(scrapeUrlId, doc.id);
    await recalcSessionProgress(sessionId);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
  } catch (err) {
    const error = err as Error;
    const code = error instanceof WebLoadError ? error.code : "unexpected";
    const isPermanent = PERMANENT_ERROR_CODES.has(code);
    const canRetry = !isPermanent && attemptNumber < MAX_RETRY_ATTEMPTS;

    if (canRetry) {
      const nextAttempt = attemptNumber + 1;
      const delayMs = RETRY_DELAY_MS[nextAttempt] || 3_600_000;
      const nextRetryAt = new Date(Date.now() + delayMs);
      const nextRetry = await createUrlRetry({
        scrapeUrlId,
        sessionId,
        kbId,
        url,
        attemptNumber: nextAttempt,
        scheduledAt: nextRetryAt,
      });

      await markRetryFailed(retryRecordId, code, error.message, nextRetryAt);
      await markScrapeUrlRetryScheduled(scrapeUrlId, nextRetryAt);
      await enqueueRetryJob(
        `${nextRetry.id}:a${nextAttempt}`,
        {
          retryRecordId: nextRetry.id,
          scrapeUrlId,
          sessionId,
          kbId,
          url,
          attemptNumber: nextAttempt,
        },
        { delaySeconds: Math.max(1, Math.round(delayMs / 1000)) },
      );
    } else {
      const finalMsg = isPermanent
        ? `Permanent failure (${code}): ${error.message}`
        : `Maximum retries (${MAX_RETRY_ATTEMPTS}) reached. Last error: [${code}] ${error.message}`;
      await markRetryFailed(retryRecordId, code, error.message, null);
      await markScrapeUrlPermanentlyFailed(scrapeUrlId, finalMsg);
    }

    await recalcSessionProgress(sessionId);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
  }
}
