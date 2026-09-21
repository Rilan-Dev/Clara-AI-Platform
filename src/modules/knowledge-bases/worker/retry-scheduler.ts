import { query } from "@/lib/db";
import { enqueueRetryJob } from "@/modules/cloud-jobs/queue";
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_MS,
  PERMANENT_ERROR_CODES,
  createUrlRetry,
  setRetryJobId,
  setRetryScheduledAt,
  getLatestScheduledRetryForUrl,
  getScrapeUrlRetryContext,
  markScrapeUrlRetryScheduled,
  setScrapeUrlRetrySchedule,
} from "@/modules/knowledge-bases/core/scrape-url-retry-db";

function withJitter(delayMs: number): number {
  const jitter = delayMs * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delayMs + jitter);
}

export async function scheduleFailedUrlRetries(
  sessionId: string,
  kbId: string,
): Promise<number> {
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
    [sessionId, MAX_RETRY_ATTEMPTS],
  );

  let scheduled = 0;
  for (const row of rows) {
    const attemptNumber = (row.retry_count ?? 0) + 1;
    const errorCode = extractErrorCode(row.error_message ?? "");
    if (PERMANENT_ERROR_CODES.has(errorCode)) continue;

    const baseDelay = RETRY_DELAY_MS[attemptNumber] ?? RETRY_DELAY_MS[MAX_RETRY_ATTEMPTS]!;
    const delay = withJitter(baseDelay);
    const scheduledAt = new Date(Date.now() + delay);

    try {
      const retryRecord = await createUrlRetry({
        scrapeUrlId: row.id,
        sessionId,
        kbId,
        url: row.url,
        attemptNumber,
        scheduledAt,
      });

      const queueResult = await enqueueRetryJob(
        `${retryRecord.id}:a${attemptNumber}`,
        {
          retryRecordId: retryRecord.id,
          scrapeUrlId: row.id,
          sessionId,
          kbId,
          url: row.url,
          attemptNumber,
        },
        { delaySeconds: Math.max(1, Math.round(delay / 1000)) },
      );

      await setRetryJobId(
        retryRecord.id,
        queueResult.messageId ?? `cloud:${retryRecord.id}:a${attemptNumber}`,
      );
      await markScrapeUrlRetryScheduled(row.id, scheduledAt);
      scheduled++;
    } catch (err) {
      console.error("[retry-scheduler] failed to schedule retry:", (err as Error).message);
    }
  }

  return scheduled;
}

export async function scheduleImmediateRetryForUrl(scrapeUrlId: string): Promise<{
  scheduled: boolean;
  reason?: string;
  attemptNumber?: number;
  nextRetryAt?: string;
}> {
  const ctx = await getScrapeUrlRetryContext(scrapeUrlId);
  if (!ctx) return { scheduled: false, reason: "not_found" };
  if (ctx.status !== "failed") return { scheduled: false, reason: "not_failed" };
  if (ctx.retryStatus === "retrying") return { scheduled: false, reason: "retrying" };
  if (ctx.retryCount >= MAX_RETRY_ATTEMPTS) return { scheduled: false, reason: "max_attempts" };

  const errorCode = extractErrorCode(ctx.errorMessage ?? "");
  if (PERMANENT_ERROR_CODES.has(errorCode)) {
    return { scheduled: false, reason: "permanent_error" };
  }

  const scheduledAt = new Date();

  if (ctx.retryStatus === "scheduled") {
    const existing = await getLatestScheduledRetryForUrl(scrapeUrlId);
    const attemptNumber = existing?.attemptNumber ?? Math.max(1, ctx.retryCount);
    if (existing) {
      await setRetryScheduledAt(existing.id, scheduledAt);
      const queueResult = await enqueueRetryJob(
        `${existing.id}:a${attemptNumber}:${Date.now()}`,
        {
          retryRecordId: existing.id,
          scrapeUrlId,
          sessionId: ctx.sessionId,
          kbId: ctx.kbId,
          url: ctx.url,
          attemptNumber,
        },
      );
      await setRetryJobId(
        existing.id,
        queueResult.messageId ?? `cloud:${existing.id}:a${attemptNumber}`,
      );
      await setScrapeUrlRetrySchedule(scrapeUrlId, scheduledAt);
      return { scheduled: true, attemptNumber, nextRetryAt: scheduledAt.toISOString() };
    }
  }

  const attemptNumber = ctx.retryCount + 1;
  const retryRecord = await createUrlRetry({
    scrapeUrlId,
    sessionId: ctx.sessionId,
    kbId: ctx.kbId,
    url: ctx.url,
    attemptNumber,
    scheduledAt,
  });

  const queueResult = await enqueueRetryJob(
    `${retryRecord.id}:a${attemptNumber}:${Date.now()}`,
    {
      retryRecordId: retryRecord.id,
      scrapeUrlId,
      sessionId: ctx.sessionId,
      kbId: ctx.kbId,
      url: ctx.url,
      attemptNumber,
    },
  );

  await setRetryJobId(
    retryRecord.id,
    queueResult.messageId ?? `cloud:${retryRecord.id}:a${attemptNumber}`,
  );
  await markScrapeUrlRetryScheduled(scrapeUrlId, scheduledAt);

  return { scheduled: true, attemptNumber, nextRetryAt: scheduledAt.toISOString() };
}

function extractErrorCode(message: string): string {
  const match = message.match(/^\[([^\]]+)\]/);
  return match?.[1] ?? "unknown";
}
