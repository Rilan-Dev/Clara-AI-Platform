/**
 * src/modules/knowledge-bases/core/scrape-sessions-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL CRUD for scrape_sessions and scrape_urls tables.
 *
 * Lifecycle:
 *   createSession()          → status = 'discovering'
 *   insertDiscoveredUrls()   → bulk-insert crawled URLs
 *   markSessionAwaiting()    → status = 'awaiting_confirmation'
 *   setUrlInclusion()        → user toggles include/exclude
 *   batchSetUrlInclusion()   → user bulk-toggles
 *   markSessionScraping()    → status = 'scraping'  (user confirmed)
 *   markSessionIngesting()   → status = 'ingesting' (KB injection running)
 *   markUrlScraping()        → status = 'scraping'  (worker picks URL)
 *   markUrlCompleted()       → status = 'completed' (page fetched + doc linked)
 *   markUrlFailed()          → status = 'failed'
 *   recalcSessionProgress()  → updates counters on session row
 *   markSessionCompleted()   → status = 'completed'
 *   markSessionFailed()      → status = 'failed'
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus =
  | "discovering"
  | "awaiting_confirmation"
  | "scraping"
  | "ingesting"
  | "completed"
  | "failed";

export type UrlStatus =
  | "pending"
  | "scraping"
  | "completed"
  | "failed"
  | "excluded";

export type ScrapeSession = {
  id:            string;
  kbId:          string;
  rootUrl:       string;
  status:        SessionStatus;
  cancelRequested: boolean;
  maxDepth:      number;
  totalUrls:     number;
  selectedUrls:  number;
  scrapedUrls:   number;
  failedUrls:    number;
  errorMessage:  string | null;
  jobId:         string | null;
  createdBy:     string | null;
  createdAt:     string;
  updatedAt:     string;
};

export type ScrapeUrl = {
  id:            string;
  sessionId:     string;
  url:           string;
  title:         string | null;
  depth:         number;
  parentUrl:     string | null;
  included:      boolean;
  status:        UrlStatus;
  documentId:    string | null;
  contentLength: number | null;
  errorMessage:  string | null;
  createdAt:     string;
  updatedAt:     string;
};

export type ScrapeSessionWithUrls = ScrapeSession & {
  urls: ScrapeUrl[];
};

// ── Row mappers ───────────────────────────────────────────────────────────────

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : new Date(ms).toISOString();
  }
  return String(value);
}

function toSession(row: Record<string, unknown>): ScrapeSession {
  return {
    id:           String(row.id),
    kbId:         String(row.kb_id),
    rootUrl:      String(row.root_url),
    status:       row.status as SessionStatus,
    cancelRequested: Boolean(row.cancel_requested),
    maxDepth:     Number(row.max_depth),
    totalUrls:    Number(row.total_urls),
    selectedUrls: Number(row.selected_urls),
    scrapedUrls:  Number(row.scraped_urls),
    failedUrls:   Number(row.failed_urls),
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    jobId:        row.job_id != null ? String(row.job_id) : null,
    createdBy:    row.created_by != null ? String(row.created_by) : null,
    createdAt:    toIsoTimestamp(row.created_at),
    updatedAt:    toIsoTimestamp(row.updated_at),
  };
}

function toUrl(row: Record<string, unknown>): ScrapeUrl {
  return {
    id:            String(row.id),
    sessionId:     String(row.session_id),
    url:           String(row.url),
    title:         row.title != null ? String(row.title) : null,
    depth:         Number(row.depth),
    parentUrl:     row.parent_url != null ? String(row.parent_url) : null,
    included:      Boolean(row.included),
    status:        row.status as UrlStatus,
    documentId:    row.document_id != null ? String(row.document_id) : null,
    contentLength: row.content_length != null ? Number(row.content_length) : null,
    errorMessage:  row.error_message != null ? String(row.error_message) : null,
    createdAt:     toIsoTimestamp(row.created_at),
    updatedAt:     toIsoTimestamp(row.updated_at),
  };
}

// ── Session CRUD ──────────────────────────────────────────────────────────────

export async function createSession(input: {
  kbId:      string;
  rootUrl:   string;
  maxDepth?: number;
  createdBy?: string;
}): Promise<ScrapeSession> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO scrape_sessions (id, kb_id, root_url, max_depth, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, input.kbId, input.rootUrl, input.maxDepth ?? 3, input.createdBy ?? null]
  );
  if (!row) throw new Error("Failed to create scrape session");
  return toSession(row);
}

export async function getSessionById(id: string): Promise<ScrapeSession | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM scrape_sessions WHERE id = $1",
    [id]
  );
  return row ? toSession(row) : null;
}

export async function setSessionJobId(id: string, jobId: string): Promise<void> {
  await execute(
    "UPDATE scrape_sessions SET job_id = $1 WHERE id = $2",
    [jobId, id]
  );
}

export async function setSessionCancelRequested(id: string, cancelRequested: boolean): Promise<void> {
  await execute(
    "UPDATE scrape_sessions SET cancel_requested = $1 WHERE id = $2",
    [cancelRequested, id]
  );
}

export async function deleteSession(id: string): Promise<void> {
  await execute("DELETE FROM scrape_sessions WHERE id = $1", [id]);
}

/** Find the most recent active session for a KB. */
export async function findActiveSession(kbId: string): Promise<ScrapeSession | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM scrape_sessions
     WHERE kb_id = $1
       AND status IN ('discovering', 'awaiting_confirmation', 'scraping', 'ingesting')
     ORDER BY created_at DESC
     LIMIT 1`,
    [kbId]
  );
  return row ? toSession(row) : null;
}

export async function listSessionsForKb(kbId: string): Promise<ScrapeSession[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM scrape_sessions WHERE kb_id = $1 ORDER BY created_at DESC",
    [kbId]
  );
  return rows.map(toSession);
}

export async function getSessionWithUrls(
  sessionId: string
): Promise<ScrapeSessionWithUrls | null> {
  const session = await getSessionById(sessionId);
  if (!session) return null;
  const urls = await listUrlsForSession(sessionId);
  return { ...session, urls };
}

export async function updateSessionStatus(
  id: string,
  status: SessionStatus,
  extra?: { errorMessage?: string }
): Promise<void> {
  await execute(
    `UPDATE scrape_sessions SET status = $1, error_message = COALESCE($2, error_message)
     WHERE id = $3`,
    [status, extra?.errorMessage ?? null, id]
  );
}

export async function markSessionAwaiting(id: string): Promise<void> {
  await execute(
    `UPDATE scrape_sessions
     SET status = 'awaiting_confirmation', error_message = NULL, cancel_requested = FALSE
     WHERE id = $1`,
    [id]
  );
}

export async function markSessionScraping(id: string): Promise<void> {
  await execute(
    `UPDATE scrape_sessions
     SET status = 'scraping', cancel_requested = FALSE
     WHERE id = $1`,
    [id]
  );
}

export async function markSessionIngesting(id: string): Promise<void> {
  await updateSessionStatus(id, "ingesting");
}

export async function markSessionCompleted(id: string): Promise<void> {
  await updateSessionStatus(id, "completed");
}

export async function markSessionFailed(id: string, errorMessage: string): Promise<void> {
  await updateSessionStatus(id, "failed", { errorMessage });
}

export async function rollbackSessionToAwaiting(sessionId: string): Promise<void> {
  await execute(
    `UPDATE scrape_urls
     SET status = CASE WHEN included THEN 'pending' ELSE 'excluded' END,
         document_id = NULL,
         error_message = NULL
     WHERE session_id = $1`,
    [sessionId]
  );

  await execute(
    `UPDATE scrape_sessions
     SET status = 'awaiting_confirmation',
         error_message = NULL,
         cancel_requested = FALSE
     WHERE id = $1`,
    [sessionId]
  );
}

/** Recomputes total/selected/scraped/failed counters from scrape_urls rows. */
export async function recalcSessionProgress(sessionId: string): Promise<void> {
  await execute(
    `UPDATE scrape_sessions s SET
       total_urls    = counts.total,
       selected_urls = counts.selected,
       scraped_urls  = counts.scraped,
       failed_urls   = counts.failed
     FROM (
       SELECT
         COUNT(*)                                             AS total,
         COUNT(*) FILTER (WHERE included = true)             AS selected,
         COUNT(*) FILTER (WHERE status = 'completed')        AS scraped,
         COUNT(*) FILTER (WHERE status = 'failed')           AS failed
       FROM scrape_urls
       WHERE session_id = $1
     ) AS counts
     WHERE s.id = $1`,
    [sessionId]
  );
}

// ── URL CRUD ──────────────────────────────────────────────────────────────────

export async function insertDiscoveredUrls(
  sessionId: string,
  urls: Array<{
    url:           string;
    title?:        string;
    depth:         number;
    parentUrl?:    string;
    contentLength?: number;
  }>
): Promise<number> {
  if (urls.length === 0) return 0;

  // Build bulk insert values
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const u of urls) {
    const id = randomUUID();
    placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    values.push(
      id,
      sessionId,
      u.url,
      u.title ?? null,
      u.depth,
      u.parentUrl ?? null,
      u.contentLength ?? null
    );
  }

  await execute(
    `INSERT INTO scrape_urls (id, session_id, url, title, depth, parent_url, content_length)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (session_id, url) DO NOTHING`,
    values
  );

  return urls.length;
}

export async function listUrlsForSession(sessionId: string): Promise<ScrapeUrl[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM scrape_urls WHERE session_id = $1 ORDER BY depth ASC, url ASC",
    [sessionId]
  );
  return rows.map(toUrl);
}

export async function getUrlById(id: string): Promise<ScrapeUrl | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM scrape_urls WHERE id = $1",
    [id]
  );
  return row ? toUrl(row) : null;
}

export async function listIncludedPendingUrls(sessionId: string): Promise<ScrapeUrl[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM scrape_urls
     WHERE session_id = $1 AND included = true AND status = 'pending'
     ORDER BY depth ASC, url ASC`,
    [sessionId]
  );
  return rows.map(toUrl);
}

/** Toggle a single URL's include/exclude flag. */
export async function setUrlInclusion(
  urlId: string,
  included: boolean
): Promise<ScrapeUrl | null> {
  const newStatus = included ? "pending" : "excluded";
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE scrape_urls SET included = $1, status = $2
     WHERE id = $3
     RETURNING *`,
    [included, newStatus, urlId]
  );
  return row ? toUrl(row) : null;
}

/** Batch toggle include/exclude for multiple URL IDs. */
export async function batchSetUrlInclusion(
  kbId: string,
  urlIds: string[],
  included: boolean
): Promise<number> {
  if (urlIds.length === 0) return 0;
  const newStatus = included ? "pending" : "excluded";
  const placeholders = urlIds.map((_, i) => `$${i + 4}`).join(", ");
  // Scope the UPDATE itself, not just a preceding read, to prevent a batch
  // of URL IDs from mutating another KB's scrape session.
  const result = await execute(
    `UPDATE scrape_urls SET included = $1, status = $2
     WHERE id IN (${placeholders})
       AND session_id IN (SELECT id FROM scrape_sessions WHERE kb_id = $3)
       AND status NOT IN ('scraping', 'completed')`,
    [included, newStatus, kbId, ...urlIds]
  );
  return typeof result === "number" ? result : 0;
}

/** Set all URLs in a session to included or excluded. */
export async function selectAllUrls(sessionId: string, included: boolean): Promise<void> {
  const newStatus = included ? "pending" : "excluded";
  await execute(
    `UPDATE scrape_urls SET included = $1, status = $2
     WHERE session_id = $3 AND status NOT IN ('scraping', 'completed')`,
    [included, newStatus, sessionId]
  );
}

export async function markUrlScraping(urlId: string): Promise<void> {
  await execute(
    "UPDATE scrape_urls SET status = 'scraping' WHERE id = $1",
    [urlId]
  );
}

export async function markUrlCompleted(
  urlId: string,
  documentId: string
): Promise<void> {
  await execute(
    "UPDATE scrape_urls SET status = 'completed', document_id = $1 WHERE id = $2",
    [documentId, urlId]
  );
}

export async function markUrlFailed(urlId: string, errorMessage: string): Promise<void> {
  await execute(
    "UPDATE scrape_urls SET status = 'failed', error_message = $1 WHERE id = $2",
    [errorMessage, urlId]
  );
}

