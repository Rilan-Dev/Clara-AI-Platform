import { crawlWebsite } from "@/modules/ingest/crawlers/web-crawler";
import {
  getSessionById,
  insertDiscoveredUrls,
  recalcSessionProgress,
  markSessionAwaiting,
  markSessionFailed,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { publishScrapeSessionRefresh } from "@/modules/knowledge-bases/core/scrape-progress-stream";

export type CloudCrawlJob = {
  sessionId: string;
  url: string;
  maxDepth: number;
  maxUrls: number;
  requestDelayMs: number;
  scopeToInputPath: boolean;
};

export async function processCrawlJobData(data: CloudCrawlJob): Promise<void> {
  const { sessionId, url, maxDepth, maxUrls, requestDelayMs, scopeToInputPath } = data;

  const session = await getSessionById(sessionId);
  if (!session || session.status === "failed" || session.cancelRequested) return;

  try {
    const crawlResult = await crawlWebsite(url, {
      maxDepth,
      maxUrls,
      requestDelayMs,
      concurrency: 3,
      scopeToInputPath,
      parseSitemap: true,
      respectRobotsTxt: true,
      shouldAbort: async () => Boolean((await getSessionById(sessionId))?.cancelRequested),
      onProgress: async () => {
        await publishScrapeSessionRefresh(sessionId).catch(() => null);
      },
    });

    await insertDiscoveredUrls(
      sessionId,
      crawlResult.discoveredUrls.map((u) => ({
        url: u.url,
        title: u.title,
        depth: u.depth,
        parentUrl: u.parentUrl ?? undefined,
        contentLength: u.contentLength,
      })),
    );

    await recalcSessionProgress(sessionId);
    await markSessionAwaiting(sessionId);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
  } catch (err) {
    const message = (err as Error).message;
    const current = await getSessionById(sessionId);
    if (message === "Crawl cancelled" || current?.cancelRequested) {
      await publishScrapeSessionRefresh(sessionId).catch(() => null);
      return;
    }

    await markSessionFailed(sessionId, `Crawl failed: ${message}`).catch(() => null);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    throw err;
  }
}
