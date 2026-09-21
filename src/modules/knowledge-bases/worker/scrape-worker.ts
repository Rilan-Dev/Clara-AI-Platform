/**
 * src/modules/knowledge-bases/worker/scrape-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the actual page scraping + ingestion after a user confirms
 * their URL selection in a scrape session.
 *
 * Deduplication flow per URL:
 *   a) Existing doc, status 'ready'           → reuse it, skip re-scraping
 *   b) Existing doc, status 'failed'/'pending' → re-fetch, refresh doc, re-queue
 *   c) No existing doc                         → create new doc + ingest job
 */

import { loadWebPage, WebLoadError } from "@/modules/admin/core/ingest/web-loader";
import {
  createDocument,
  createIngestJob,
  findDocumentBySourceUrl,
} from "@/modules/knowledge-bases/core/documents-db";
import {
  getSessionById,
  listIncludedPendingUrls,
  markUrlScraping,
  markUrlCompleted,
  markUrlFailed,
  markSessionCompleted,
  markSessionFailed,
  markSessionIngesting,
  recalcSessionProgress,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { publishScrapeSessionRefresh } from "@/modules/knowledge-bases/core/scrape-progress-stream";
import { enqueueIngestJob } from "@/modules/cloud-jobs/queue";
import { scheduleFailedUrlRetries } from "@/modules/knowledge-bases/worker/retry-scheduler";

export type ScrapeWorkerResult = {
  sessionId:  string;
  scraped:    number;   // new documents created
  failed:     number;   // URLs that errored
  skipped:    number;   // URLs reusing an existing 'ready' document
  refreshed:  number;   // URLs whose failed/pending doc was re-ingested
};

const MAX_URL_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number): number {
  const base = 1_500 * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 750);
  return base + jitter;
}

async function loadPageWithRetries(
  url: string,
  shouldStop: () => Promise<boolean>,
): Promise<{ page: Awaited<ReturnType<typeof loadWebPage>>; attempts: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_URL_ATTEMPTS; attempt++) {
    if (await shouldStop()) {
      throw new WebLoadError("Scrape cancelled", "hard-block", false);
    }

    try {
      const page = await loadWebPage(url);
      return { page, attempts: attempt };
    } catch (error) {
      lastError = error as Error;
      const retryable = error instanceof WebLoadError ? error.retryable : true;
      const code = error instanceof WebLoadError ? error.code : "unknown";

      if (!retryable || attempt >= MAX_URL_ATTEMPTS) break;

      const delayMs = getRetryDelayMs(attempt);
      console.warn(`[scrape-worker] ↻ retry ${attempt}/${MAX_URL_ATTEMPTS - 1} for ${url} after ${code} (${delayMs}ms)`);
      await sleep(delayMs);
    }
  }

  throw lastError ?? new WebLoadError(`Failed to load ${url}`, "empty-content", true);
}

export async function runScrapeSession(
  sessionId: string,
  options: {
    concurrency?: number;
    maxUrls?: number;
  } = {}
): Promise<ScrapeWorkerResult & { hasMore: boolean }> {
  const { concurrency = 2, maxUrls = 10 } = options;

  const session = await getSessionById(sessionId);
  if (!session) throw new Error(`Scrape session ${sessionId} not found`);

  if (session.status !== "scraping") {
    throw new Error(
      `Session ${sessionId} is not in 'scraping' state (current: ${session.status})`
    );
  }

  const urls = await listIncludedPendingUrls(sessionId);
  const urlsToProcess = urls.slice(0, Math.max(1, maxUrls));
  const { kbId } = session;

  const ensureNotCancelled = async (): Promise<boolean> => {
    const current = await getSessionById(sessionId);
    return Boolean(current?.cancelRequested || current?.status === "failed");
  };

  let scraped   = 0;
  let failed    = 0;
  let skipped   = 0;
  let refreshed = 0;


  console.log(
    `[scrape-worker] Session ${sessionId}: ${urls.length} URLs to scrape (concurrency=${concurrency})`
  );

  for (let i = 0; i < urlsToProcess.length; i += concurrency) {
    const batch = urlsToProcess.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (scrapeUrl) => {
        if (await ensureNotCancelled()) return;

        await markUrlScraping(scrapeUrl.id);
        await publishScrapeSessionRefresh(sessionId).catch(() => null);

        try {
          const existing = await findDocumentBySourceUrl(kbId, scrapeUrl.url);

          if (existing?.status === "ready") {
            await markUrlCompleted(scrapeUrl.id, existing.id);
            skipped++;
            console.log(`[scrape-worker] ⏭  Reusing existing doc for ${scrapeUrl.url}`);
            await recalcSessionProgress(sessionId);
            await publishScrapeSessionRefresh(sessionId).catch(() => null);
            return;
          }

          const { page, attempts } = await loadPageWithRetries(scrapeUrl.url, ensureNotCancelled);
          if (await ensureNotCancelled()) return;

          if (!page.text?.trim()) {
            throw new Error("Page returned no extractable text content");
          }

          const textContent = buildRagContent(page);
          const base64      = Buffer.from(textContent, "utf-8").toString("base64");
          const fileSize    = Buffer.byteLength(textContent, "utf-8");
          const safeTitle   = (page.title || scrapeUrl.url)
            .replace(/[^a-z0-9\-_ ]/gi, "_").slice(0, 100);
          const filename    = `${safeTitle}.md`;
          const doc = await createDocument({
            kbId,
            title:                  page.title || scrapeUrl.url,
            originalFilename:       scrapeUrl.url,
            sourceType:             "url",
            createdByScrapeSessionId: sessionId,
            mimeType:               "text/markdown",
            fileSize,
          });
          if (existing) refreshed++;
          else scraped++;

          const ingestJob = await createIngestJob(doc.id, kbId, {
            base64,
            mimeType: "text/markdown",
            filename,
          });
          await enqueueIngestJob(ingestJob.id);
          if (await ensureNotCancelled()) return;
          await markUrlCompleted(scrapeUrl.id, doc.id);
          console.log(`[scrape-worker] ✅ ${scrapeUrl.url} (attempts=${attempts})`);

        } catch (err) {
          const error = err as Error;
          if (error instanceof WebLoadError && error.message === "Scrape cancelled") {
            return;
          }
          const code = err instanceof WebLoadError ? err.code : "unexpected";
          const message = `[${code}] ${error.message}`;
          console.error(`[scrape-worker] ❌ ${scrapeUrl.url}:`, message);
          await markUrlFailed(scrapeUrl.id, message);
          failed++;
          scheduleFailedUrlRetries(sessionId, kbId).catch((e) =>
            console.error(`[scrape-worker] retry scheduling error for session ${sessionId}:`, (e as Error).message)
          );
        }

        await recalcSessionProgress(sessionId);
        await publishScrapeSessionRefresh(sessionId).catch(() => null);
      })
    );
  }

  if (await ensureNotCancelled()) {
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    return { sessionId, scraped, failed, skipped, refreshed, hasMore: false };
  }

  if (scraped === 0 && refreshed === 0 && skipped === 0 && failed > 0 && urlsToProcess.length >= urls.length) {
    await markSessionFailed(sessionId, `All ${failed} URLs failed to scrape`);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    return { sessionId, scraped, failed, skipped, refreshed, hasMore: false };
  }

  const remaining = await listIncludedPendingUrls(sessionId);
  if (remaining.length > 0) {
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    return { sessionId, scraped, failed, skipped, refreshed, hasMore: true };
  }

  const totalCreated = scraped + refreshed;
  if (totalCreated > 0) {
    await markSessionIngesting(sessionId);
  } else if (skipped > 0) {
    await markSessionCompleted(sessionId);
  } else {
    await markSessionFailed(sessionId, "No scraped documents were successfully added to the knowledge base");
  }
  await publishScrapeSessionRefresh(sessionId).catch(() => null);

  if (failed > 0) {
    scheduleFailedUrlRetries(sessionId, kbId).catch((e) =>
      console.error(`[scrape-worker] retry scheduling error for session ${sessionId}:`, (e as Error).message)
    );
  }

  return { sessionId, scraped, failed, skipped, refreshed, hasMore: false };
}

// ── Content formatter ─────────────────────────────────────────────────────────

function buildRagContent(page: {
  url: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}): string {
  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  lines.push("");
  lines.push(`**Source:** ${page.url}`);
  if (page.metadata?.description) lines.push(`**Description:** ${page.metadata.description}`);
  lines.push(`**Scraped:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(page.text.trim());
  return lines.join("\n");
}
