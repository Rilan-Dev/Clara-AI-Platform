/**
 * src/modules/knowledge-bases/worker/scrape-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the actual page scraping + ingestion after a user confirms
 * their URL selection in a scrape session.
 *
 * Flow per URL:
 *   1. Mark URL as 'scraping'
 *   2. loadWebPage() → extract text content
 *   3. createDocument() row with sourceType='url'
 *   4. createIngestJob() → reuses existing parse→chunk→embed→Qdrant pipeline
 *   5. markUrlCompleted() / markUrlFailed()
 *   6. After all URLs: markSessionCompleted() / markSessionFailed()
 *
 * Called by:
 *   POST /api/worker/scrape  — fire-and-forget after user clicks "Start Scraping"
 */

import { loadWebPage } from "@/modules/admin/core/ingest/web-loader";
import { createDocument, createIngestJob } from "@/modules/knowledge-bases/core/documents-db";
import {
  getSessionById,
  listIncludedPendingUrls,
  markUrlScraping,
  markUrlCompleted,
  markUrlFailed,
  markSessionCompleted,
  markSessionFailed,
  recalcSessionProgress,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";

export type ScrapeWorkerResult = {
  sessionId:  string;
  scraped:    number;
  failed:     number;
  skipped:    number;
};

/**
 * Runs the scrape + ingest pipeline for all user-selected URLs in a session.
 * This is designed to be called fire-and-forget (via POST /api/worker/scrape).
 */
export async function runScrapeSession(
  sessionId: string,
  options: {
    concurrency?: number;    // parallel page fetches (default: 2)
    triggerIngestOrigin?: string; // base URL for self-HTTP ingest worker trigger
    workerSecret?: string;
  } = {}
): Promise<ScrapeWorkerResult> {
  const { concurrency = 2, triggerIngestOrigin, workerSecret } = options;

  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error(`Scrape session ${sessionId} not found`);
  }

  if (session.status !== "scraping") {
    throw new Error(
      `Session ${sessionId} is not in 'scraping' state (current: ${session.status})`
    );
  }

  const urls = await listIncludedPendingUrls(sessionId);
  const { kbId } = session;

  let scraped = 0;
  let failed  = 0;
  let skipped = 0;

  console.log(
    `[scrape-worker] Session ${sessionId}: ${urls.length} URLs to scrape (concurrency=${concurrency})`
  );

  // Process URLs in batches respecting concurrency limit
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (scrapeUrl) => {
        // Skip if session was externally cancelled/failed
        const current = await getSessionById(sessionId);
        if (current?.status === "failed") {
          skipped++;
          return;
        }

        await markUrlScraping(scrapeUrl.id);

        try {
          // 1. Fetch + extract page content
          const page = await loadWebPage(scrapeUrl.url);

          if (!page.text?.trim()) {
            throw new Error("Page returned no extractable text content");
          }

          // 2. Build a base64 payload from the extracted text
          //    We treat the HTML text as a plain-text "file" for the ingest pipeline.
          //    The ingest worker will parse it as text, chunk it, and embed it.
          const textContent = buildRagContent(page);
          const base64 = Buffer.from(textContent, "utf-8").toString("base64");

          // 3. Derive a clean filename for the parser (text/plain)
          const safeTitle = (page.title || scrapeUrl.url)
            .replace(/[^a-z0-9\-_ ]/gi, "_")
            .slice(0, 100);
          const filename = `${safeTitle}.md`;

          // 4. Create document row (sourceType='url')
          const doc = await createDocument({
            kbId,
            title:            page.title || scrapeUrl.url,
            originalFilename: scrapeUrl.url,  // store original URL as "filename" for reference
            mimeType:         "text/markdown",
            fileSize:         Buffer.byteLength(textContent, "utf-8"),
          });

          // 5. Enqueue ingest job — reuses existing pipeline (chunk→embed→Qdrant)
          await createIngestJob(doc.id, kbId, {
            base64,
            mimeType: "text/markdown",
            filename,
          });

          // 6. Mark URL as completed
          await markUrlCompleted(scrapeUrl.id, doc.id);
          scraped++;

          console.log(`[scrape-worker] ✅ ${scrapeUrl.url}`);

        } catch (err) {
          const message = (err as Error).message;
          console.error(`[scrape-worker] ❌ ${scrapeUrl.url}:`, message);
          await markUrlFailed(scrapeUrl.id, message);
          failed++;
        }

        await recalcSessionProgress(sessionId);
      })
    );
  }

  // Mark session complete/failed
  const finalFailed = failed;
  if (scraped === 0 && finalFailed > 0) {
    await markSessionFailed(sessionId, `All ${finalFailed} URLs failed to scrape`);
  } else {
    await markSessionCompleted(sessionId);
  }

  // Trigger the ingest worker to process newly created jobs
  if (triggerIngestOrigin && scraped > 0) {
    try {
      const headers: Record<string, string> = {};
      if (workerSecret) headers["x-worker-secret"] = workerSecret;
      fetch(`${triggerIngestOrigin}/api/worker/ingest?drain=true`, {
        method: "GET", headers,
      }).catch(() => null);
    } catch { /* best-effort */ }
  }

  console.log(
    `[scrape-worker] Session ${sessionId} done — ` +
    `scraped=${scraped}, failed=${failed}, skipped=${skipped}`
  );

  return { sessionId, scraped, failed, skipped };
}

// ── Content formatter ─────────────────────────────────────────────────────────

/**
 * Converts a scraped WebDocument into RAG-optimised markdown.
 * The source URL and title are included as metadata so retrievals
 * can cite the original page.
 */
function buildRagContent(page: { url: string; title: string; text: string; metadata: Record<string, unknown> }): string {
  const lines: string[] = [];

  lines.push(`# ${page.title}`);
  lines.push("");
  lines.push(`**Source:** ${page.url}`);

  if (page.metadata?.description) {
    lines.push(`**Description:** ${page.metadata.description}`);
  }

  lines.push(`**Scraped:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(page.text.trim());

  return lines.join("\n");
}
