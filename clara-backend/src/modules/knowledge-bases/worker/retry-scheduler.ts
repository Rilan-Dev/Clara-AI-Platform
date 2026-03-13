/**
 * src/modules/knowledge-bases/worker/retry-scheduler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * scheduleFailedUrlRetries()
 *
 * Called at the end of runScrapeSession() to enqueue BullMQ delayed jobs for
 * every failed URL that is still retryable. Idempotent — safe to call twice.
 *
 * Rules:
 *   • Skip URLs already at retry_status = 'scheduled' | 'retrying' | 'succeeded'
 *   • Skip URLs where the original error_code is a PERMANENT_ERROR_CODE
 *   • Skip URLs that have already exhausted MAX_RETRY_ATTEMPTS
 *   • Apply jitter (±20%) to the delay to avoid thundering-herd on shared sites
 */

import { query } from "@/lib/db";
import { getRetryQueue } from "@/modules/queue";
import type { UrlRetryJobData } from "@/modules/queue";
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_MS,
  PERMANENT_ERROR_CODES,
  createUrlRetry,
  setRetryJobId,
  markScrapeUrlRetryScheduled,
} from "@/modules/knowledge-bases/core/scrape-url-retry-db";

/** Apply ±20% random jitter to a delay so concurrent retries don't pile up. */
function withJitter(delayMs: number): number {
  const jitter = delayMs * 0.2 * (Math.random() * 2 - 1); // ±20%
  return Math.round(delayMs + jitter);
}

/**
 * For every failed URL in the session whose error is retryable and which
 * has not yet exhausted MAX_RETRY_ATTEMPTS, enqueue a delayed BullMQ job.
 *
 * Returns the number of retry jobs scheduled.
 */
export async function scheduleFailedUrlRetries(
  sessionId: string,
  kbId: string,
): Promise<number> {
  // Load all failed URLs that need a retry scheduled
  const rows = await query<{
    id: string; url: string; error_message: string | null;
    retry_count: number; retry_status: string | null;
  }>(
    `SELECT id, url, error_message, retry_count, retry_status
     FROM scrape_urls
     WHERE session_id = $1
       AND status = 'failed'
       AND (retry_status IS NULL OR retry_status = 'failed')
       AND retry_count < $2`,
    [sessionId, MAX_RETRY_ATTEMPTS]
  );

  if (rows.length === 0) return 0;

  const retryQueue = getRetryQueue();
  let scheduled = 0;

  for (const row of rows) {
    const attemptNumber = (row.retry_count ?? 0) + 1; // next attempt

    // Classify the original error — skip permanent errors
    const errorMsg = row.error_message ?? "";
    const errorCode = extractErrorCode(errorMsg);
    if (PERMANENT_ERROR_CODES.has(errorCode)) {
      console.log(
        `[retry-scheduler] ⛔ ${row.url} — permanent error (${errorCode}), not scheduling retry`
      );
      continue;
    }

    const baseDelay = RETRY_DELAY_MS[attemptNumber] ?? RETRY_DELAY_MS[MAX_RETRY_ATTEMPTS]!;
    const delay     = withJitter(baseDelay);
    const scheduledAt = new Date(Date.now() + delay);

    try {
      // Create DB record first so we have the retryRecordId for the job payload
      const retryRecord = await createUrlRetry({
        scrapeUrlId:   row.id,
        sessionId,
        kbId,
        url:           row.url,
        attemptNumber,
        scheduledAt,
      });

      const payload: UrlRetryJobData = {
        retryRecordId: retryRecord.id,
        scrapeUrlId:   row.id,
        sessionId,
        kbId,
        url:           row.url,
        attemptNumber,
      };

      const job = await retryQueue.add(`retry-url`, payload, {
        delay,
        jobId: `retry-${row.id}-a${attemptNumber}`, // dedupe key
      });

      // Back-fill the BullMQ job ID into the retry record
      await setRetryJobId(retryRecord.id, job.id!);

      // Update the scrape_url row
      await markScrapeUrlRetryScheduled(row.id, scheduledAt);

      const humanDelay = delay < 60_000
        ? `${Math.round(delay / 1000)}s`
        : `${Math.round(delay / 60_000)}m`;

      console.log(
        `[retry-scheduler] ⏰ Scheduled retry #${attemptNumber} for ${row.url}` +
        ` in ${humanDelay} (job=${job.id})`
      );
      scheduled++;
    } catch (err) {
      // Don't let one URL failure block others
      console.error(
        `[retry-scheduler] Failed to schedule retry for ${row.url}:`,
        (err as Error).message
      );
    }
  }

  console.log(
    `[retry-scheduler] Session ${sessionId}: scheduled ${scheduled}/${rows.length} retries`
  );
  return scheduled;
}

/** Extract the error code from a stored error_message like "[soft-block] Blocked..." */
function extractErrorCode(message: string): string {
  const match = message.match(/^\[([^\]]+)\]/);
  return match?.[1] ?? "unknown";
}
