/**
 * src/modules/knowledge-bases/core/scrape-url-retry-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL CRUD for the scrape_url_retries table and retry-related columns
 * on scrape_urls.
 *
 * Retry schedule (exponential back-off, jitter applied by the worker):
 *   Attempt 1 →  5 minutes
 *   Attempt 2 → 30 minutes
 *   Attempt 3 →  2 hours
 *   After attempt 3 → mark scrape_url.retry_status = 'permanently_failed'
 *
 * Error classification:
 *   PERMANENT (no retry): 'hard-block'
 *   TRANSIENT (retry):    everything else
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "@/lib/db";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_RETRY_ATTEMPTS = 3;

/** Delay in milliseconds for each retry attempt (1-indexed). */
export const RETRY_DELAY_MS: Record<number, number> = {
  1:  5   * 60 * 1_000,  // 5 minutes
  2:  30  * 60 * 1_000,  // 30 minutes
  3:  120 * 60 * 1_000,  // 2 hours
};

/** Error codes that will never succeed on retry — skip scheduling. */
export const PERMANENT_ERROR_CODES = new Set(["hard-block"]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type UrlRetryStatus = "scheduled" | "running" | "succeeded" | "failed";
export type UrlRetryStatusOnUrl =
  | "scheduled"
  | "retrying"
  | "succeeded"
  | "permanently_failed";

export type UrlRetry = {
  id:            string;
  scrapeUrlId:   string;
  sessionId:     string;
  kbId:          string;
  url:           string;
  attemptNumber: number;
  status:        UrlRetryStatus;
  errorCode:     string | null;
  errorMessage:  string | null;
  scheduledAt:   string;
  startedAt:     string | null;
  completedAt:   string | null;
  nextRetryAt:   string | null;
  jobId:         string | null;
  createdAt:     string;
  updatedAt:     string;
};

export type FailedUrlWithRetries = {
  id:            string;
  sessionId:     string;
  url:           string;
  title:         string | null;
  depth:         number;
  errorMessage:  string | null;
  retryCount:    number;
  retryStatus:   UrlRetryStatusOnUrl | null;
  nextRetryAt:   string | null;
  retries:       UrlRetry[];
};

export type ScrapeUrlRetryContext = {
  id: string;
  sessionId: string;
  kbId: string;
  url: string;
  status: string;
  retryCount: number;
  retryStatus: UrlRetryStatusOnUrl | null;
  errorMessage: string | null;
};

// ── Row mappers ───────────────────────────────────────────────────────────────

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") { const ms = Date.parse(v); return isNaN(ms) ? v : new Date(ms).toISOString(); }
  return String(v);
}

function toRetry(row: Record<string, unknown>): UrlRetry {
  return {
    id:            String(row.id),
    scrapeUrlId:   String(row.scrape_url_id),
    sessionId:     String(row.session_id),
    kbId:          String(row.kb_id),
    url:           String(row.url),
    attemptNumber: Number(row.attempt_number),
    status:        row.status as UrlRetryStatus,
    errorCode:     row.error_code != null ? String(row.error_code) : null,
    errorMessage:  row.error_message != null ? String(row.error_message) : null,
    scheduledAt:   toIso(row.scheduled_at),
    startedAt:     row.started_at != null ? toIso(row.started_at) : null,
    completedAt:   row.completed_at != null ? toIso(row.completed_at) : null,
    nextRetryAt:   row.next_retry_at != null ? toIso(row.next_retry_at) : null,
    jobId:         row.job_id != null ? String(row.job_id) : null,
    createdAt:     toIso(row.created_at),
    updatedAt:     toIso(row.updated_at),
  };
}

// ── Retry record CRUD ─────────────────────────────────────────────────────────

/** Create a new retry attempt record. Returns the record so the caller can
 *  store its id in BullMQ job data for lookup on job completion. */
export async function createUrlRetry(input: {
  scrapeUrlId:   string;
  sessionId:     string;
  kbId:          string;
  url:           string;
  attemptNumber: number;
  scheduledAt:   Date;
}): Promise<UrlRetry> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO scrape_url_retries
       (id, scrape_url_id, session_id, kb_id, url, attempt_number, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, input.scrapeUrlId, input.sessionId, input.kbId, input.url,
     input.attemptNumber, input.scheduledAt.toISOString()]
  );
  if (!row) throw new Error("Failed to create scrape_url_retry record");
  return toRetry(row);
}

export async function setRetryJobId(retryId: string, jobId: string): Promise<void> {
  await execute(
    "UPDATE scrape_url_retries SET job_id = $1 WHERE id = $2",
    [jobId, retryId]
  );
}

export async function markRetryRunning(retryId: string): Promise<void> {
  await execute(
    "UPDATE scrape_url_retries SET status = 'running', started_at = now() WHERE id = $1",
    [retryId]
  );
}

export async function markRetrySucceeded(retryId: string): Promise<void> {
  await execute(
    "UPDATE scrape_url_retries SET status = 'succeeded', completed_at = now() WHERE id = $1",
    [retryId]
  );
}

export async function markRetryFailed(
  retryId: string,
  errorCode: string,
  errorMessage: string,
  nextRetryAt: Date | null
): Promise<void> {
  await execute(
    `UPDATE scrape_url_retries
     SET status = 'failed', completed_at = now(),
         error_code = $1, error_message = $2, next_retry_at = $3
     WHERE id = $4`,
    [errorCode, errorMessage, nextRetryAt?.toISOString() ?? null, retryId]
  );
}

export async function getRetryById(retryId: string): Promise<UrlRetry | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM scrape_url_retries WHERE id = $1",
    [retryId]
  );
  return row ? toRetry(row) : null;
}

export async function getRetryByJobId(jobId: string): Promise<UrlRetry | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM scrape_url_retries WHERE job_id = $1 LIMIT 1",
    [jobId]
  );
  return row ? toRetry(row) : null;
}

export async function listRetriesForUrl(scrapeUrlId: string): Promise<UrlRetry[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM scrape_url_retries WHERE scrape_url_id = $1 ORDER BY attempt_number ASC",
    [scrapeUrlId]
  );
  return rows.map(toRetry);
}

export async function listRetriesForSession(sessionId: string): Promise<UrlRetry[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM scrape_url_retries WHERE session_id = $1 ORDER BY scrape_url_id, attempt_number ASC",
    [sessionId]
  );
  return rows.map(toRetry);
}

export async function getLatestScheduledRetryForUrl(scrapeUrlId: string): Promise<UrlRetry | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM scrape_url_retries WHERE scrape_url_id = $1 AND status = 'scheduled' ORDER BY attempt_number DESC LIMIT 1",
    [scrapeUrlId]
  );
  return row ? toRetry(row) : null;
}

export async function setRetryScheduledAt(retryId: string, scheduledAt: Date): Promise<void> {
  await execute(
    "UPDATE scrape_url_retries SET scheduled_at = $1, updated_at = now() WHERE id = $2",
    [scheduledAt.toISOString(), retryId]
  );
}

// ── scrape_urls retry columns ─────────────────────────────────────────────────

/** Mark a URL as having a retry scheduled. */
export async function markScrapeUrlRetryScheduled(
  urlId: string,
  nextRetryAt: Date,
): Promise<void> {
  await execute(
    `UPDATE scrape_urls
     SET retry_status = 'scheduled', next_retry_at = $1, retry_count = retry_count + 1
     WHERE id = $2`,
    [nextRetryAt.toISOString(), urlId]
  );
}

export async function setScrapeUrlRetrySchedule(urlId: string, nextRetryAt: Date): Promise<void> {
  await execute(
    "UPDATE scrape_urls SET retry_status = 'scheduled', next_retry_at = $1 WHERE id = $2",
    [nextRetryAt.toISOString(), urlId]
  );
}

/** Mark a URL as actively being retried right now. */
export async function markScrapeUrlRetrying(urlId: string): Promise<void> {
  await execute(
    "UPDATE scrape_urls SET retry_status = 'retrying', next_retry_at = NULL WHERE id = $1",
    [urlId]
  );
}

/** Retry succeeded — also update the main status to 'completed'. */
export async function markScrapeUrlRetrySucceeded(
  urlId: string,
  documentId: string
): Promise<void> {
  await execute(
    `UPDATE scrape_urls
     SET status = 'completed', retry_status = 'succeeded',
         document_id = $1, next_retry_at = NULL, error_message = NULL
     WHERE id = $2`,
    [documentId, urlId]
  );
}

/** All retry attempts exhausted, or error is unretryable. */
export async function markScrapeUrlPermanentlyFailed(
  urlId: string,
  finalErrorMessage: string
): Promise<void> {
  await execute(
    `UPDATE scrape_urls
     SET retry_status = 'permanently_failed', next_retry_at = NULL,
         error_message = $1
     WHERE id = $2`,
    [finalErrorMessage, urlId]
  );
}

// ── Composite query — failed URLs with full retry history ─────────────────────

/** Returns all failed scrape_urls for a session, each enriched with its
 *  complete retry history and current retry_status. Used by the API endpoint
 *  and the UI failed-URL panel. */
export async function listFailedUrlsWithRetries(
  sessionId: string
): Promise<FailedUrlWithRetries[]> {
  // 1. Load failed URLs
  const urlRows = await query<Record<string, unknown>>(
    `SELECT id, session_id, url, title, depth, error_message,
            retry_count, retry_status, next_retry_at
     FROM scrape_urls
     WHERE session_id = $1
       AND status = 'failed'
     ORDER BY url ASC`,
    [sessionId]
  );
  if (urlRows.length === 0) return [];

  // 2. Load all retry records for those URLs in one query
  const urlIds = urlRows.map((r) => String(r.id));
  const placeholders = urlIds.map((_, i) => `$${i + 1}`).join(", ");
  const retryRows = await query<Record<string, unknown>>(
    `SELECT * FROM scrape_url_retries
     WHERE scrape_url_id IN (${placeholders})
     ORDER BY scrape_url_id, attempt_number ASC`,
    urlIds
  );

  // Group retries by scrapeUrlId
  const retryMap = new Map<string, UrlRetry[]>();
  for (const rr of retryRows) {
    const r = toRetry(rr);
    if (!retryMap.has(r.scrapeUrlId)) retryMap.set(r.scrapeUrlId, []);
    retryMap.get(r.scrapeUrlId)!.push(r);
  }

  return urlRows.map((r) => ({
    id:          String(r.id),
    sessionId:   String(r.session_id),
    url:         String(r.url),
    title:       r.title != null ? String(r.title) : null,
    depth:       Number(r.depth),
    errorMessage: r.error_message != null ? String(r.error_message) : null,
    retryCount:  Number(r.retry_count ?? 0),
    retryStatus: (r.retry_status as UrlRetryStatusOnUrl | null) ?? null,
    nextRetryAt: r.next_retry_at != null ? toIso(r.next_retry_at) : null,
    retries:     retryMap.get(String(r.id)) ?? [],
  }));
}

export async function getScrapeUrlRetryContext(urlId: string): Promise<ScrapeUrlRetryContext | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT u.id, u.session_id, u.url, u.status, u.retry_count, u.retry_status, u.error_message,
            s.kb_id
     FROM scrape_urls u
     JOIN scrape_sessions s ON s.id = u.session_id
     WHERE u.id = $1`,
    [urlId]
  );
  if (!row) return null;
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    kbId: String(row.kb_id),
    url: String(row.url),
    status: String(row.status),
    retryCount: Number(row.retry_count ?? 0),
    retryStatus: (row.retry_status as UrlRetryStatusOnUrl | null) ?? null,
    errorMessage: row.error_message != null ? String(row.error_message) : null,
  };
}
