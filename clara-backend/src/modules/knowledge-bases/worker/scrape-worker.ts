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

import { loadWebPage } from "@/modules/admin/core/ingest/web-loader";
import {
  createDocument,
  createIngestJob,
  findDocumentBySourceUrl,
  refreshDocument,
} from "@/modules/knowledge-bases/core/documents-db";
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
import { drainQueue } from "@/modules/knowledge-bases/worker/ingest-worker";

export type ScrapeWorkerResult = {
  sessionId:  string;
  scraped:    number;   // new documents created
  failed:     number;   // URLs that errored
  skipped:    number;   // URLs reusing an existing 'ready' document
  refreshed:  number;   // URLs whose failed/pending doc was re-ingested
};

export async function runScrapeSession(
  sessionId: string,
  options: {
    concurrency?: number;
  } = {}
): Promise<ScrapeWorkerResult> {
  const { concurrency = 2 } = options;

  const session = await getSessionById(sessionId);
  if (!session) throw new Error(`Scrape session ${sessionId} not found`);

  if (session.status !== "scraping") {
    throw new Error(
      `Session ${sessionId} is not in 'scraping' state (current: ${session.status})`
    );
  }

  const urls  = await listIncludedPendingUrls(sessionId);
  const { kbId } = session;

  let scraped   = 0;
  let failed    = 0;
  let skipped   = 0;
  let refreshed = 0;

  console.log(
    `[scrape-worker] Session ${sessionId}: ${urls.length} URLs to scrape (concurrency=${concurrency})`
  );

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async (scrapeUrl) => {
        // Abort if session was externally cancelled/failed
        const current = await getSessionById(sessionId);
        if (current?.status === "failed") { skipped++; return; }

        await markUrlScraping(scrapeUrl.id);

        try {
          // ── Deduplication check ──────────────────────────────────────────
          const existing = await findDocumentBySourceUrl(kbId, scrapeUrl.url);

          if (existing?.status === "ready") {
            // Already ingested — reuse, no re-scrape needed
            await markUrlCompleted(scrapeUrl.id, existing.id);
            skipped++;
            console.log(`[scrape-worker] ⏭  Reusing existing doc for ${scrapeUrl.url}`);
            await recalcSessionProgress(sessionId);
            return;
          }

          // ── Fetch page content ───────────────────────────────────────────
          const page = await loadWebPage(scrapeUrl.url);

          if (!page.text?.trim()) {
            throw new Error("Page returned no extractable text content");
          }

          const textContent = buildRagContent(page);
          const base64      = Buffer.from(textContent, "utf-8").toString("base64");
          const fileSize    = Buffer.byteLength(textContent, "utf-8");
          const safeTitle   = (page.title || scrapeUrl.url)
            .replace(/[^a-z0-9\-_ ]/gi, "_").slice(0, 100);
          const filename    = `${safeTitle}.md`;

          let doc;

          if (existing) {
            // Re-scrape: refresh the existing failed/pending document
            await refreshDocument(existing.id, { title: page.title || scrapeUrl.url, fileSize });
            doc = { ...existing, title: page.title || scrapeUrl.url };
            refreshed++;
            console.log(`[scrape-worker] 🔄 Refreshing existing doc for ${scrapeUrl.url}`);
          } else {
            // First scrape: create a new document
            doc = await createDocument({
              kbId,
              title:            page.title || scrapeUrl.url,
              originalFilename: scrapeUrl.url,
              mimeType:         "text/markdown",
              fileSize,
            });
            scraped++;
          }

          await createIngestJob(doc.id, kbId, { base64, mimeType: "text/markdown", filename });
          await markUrlCompleted(scrapeUrl.id, doc.id);
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
  if (scraped === 0 && refreshed === 0 && failed > 0) {
    await markSessionFailed(sessionId, `All ${failed} URLs failed to scrape`);
  } else {
    await markSessionCompleted(sessionId);
  }

  // Trigger ingest worker to process newly created jobs
  if ((scraped + refreshed) > 0) {
    queueMicrotask(() => {
      void drainQueue(50).catch((err) => {
        console.error("[scrape-worker] ingest drain failed:", (err as Error).message);
      });
    });
  }

  console.log(
    `[scrape-worker] Session ${sessionId} done — ` +
    `scraped=${scraped}, refreshed=${refreshed}, skipped=${skipped}, failed=${failed}`
  );

  return { sessionId, scraped, failed, skipped, refreshed };
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
