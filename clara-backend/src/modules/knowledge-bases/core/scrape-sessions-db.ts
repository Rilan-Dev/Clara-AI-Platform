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
 *   markUrlScraping()        → status = 'scraping'  (worker picks URL)
 *   markUrlCompleted()       → status = 'completed' (ingest done)
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

function toSession(row: Record<string, unknown>): ScrapeSession {
  return {
    id:           String(row.id),
    kbId:         String(row.kb_id),
    rootUrl:      String(row.root_url),
    status:       row.status as SessionStatus,
    maxDepth:     Number(row.max_depth),
    totalUrls:    Number(row.total_urls),
    selectedUrls: Number(row.selected_urls),
    scrapedUrls:  Number(row.scraped_urls),
    failedUrls:   Number(row.failed_urls),
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    jobId:        row.job_id != null ? String(row.job_id) : null,
    createdBy:    row.created_by != null ? String(row.created_by) : null,
    createdAt:    String(row.created_at),
    updatedAt:    String(row.updated_at),
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
    createdAt:     String(row.created_at),
    updatedAt:     String(row.updated_at),
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

/** Find the most recent active session (discovering or scraping) for a KB. */
export async function findActiveSession(kbId: string): Promise<ScrapeSession | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM scrape_sessions
     WHERE kb_id = $1
       AND status IN ('discovering', 'awaiting_confirmation', 'scraping')
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
  await updateSessionStatus(id, "awaiting_confirmation");
}

export async function markSessionScraping(id: string): Promise<void> {
  await updateSessionStatus(id, "scraping");
}

export async function markSessionCompleted(id: string): Promise<void> {
  await updateSessionStatus(id, "completed");
}

export async function markSessionFailed(id: string, errorMessage: string): Promise<void> {
  await updateSessionStatus(id, "failed", { errorMessage });
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
  urlIds: string[],
  included: boolean
): Promise<number> {
  if (urlIds.length === 0) return 0;
  const newStatus = included ? "pending" : "excluded";
  const placeholders = urlIds.map((_, i) => `$${i + 3}`).join(", ");
  const result = await execute(
    `UPDATE scrape_urls SET included = $1, status = $2
     WHERE id IN (${placeholders}) AND status NOT IN ('scraping', 'completed')`,
    [included, newStatus, ...urlIds]
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
