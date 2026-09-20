import Redis from "ioredis";
import { getSessionIngestProgress } from "@/modules/knowledge-bases/core/documents-db";
import {
  getSessionById,
  listUrlsForSession,
  type SessionStatus,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { getCrawlQueue, type CrawlJobProgress } from "@/modules/queue";
import { redisConnection } from "@/modules/queue/redis";

const CHANNEL_PREFIX = "scrape-session:";

declare global {
  var __scrapeStreamPublisher: Redis | undefined;
}

export type ScrapeStreamSnapshot = {
  sessionId: string;
  rootUrl: string;
  status: SessionStatus;
  cancelRequested: boolean;
  totalUrls: number;
  selectedUrls: number;
  scrapedUrls: number;
  failedUrls: number;
  pendingUrls: number;
  scrapingUrls: number;
  jobProgress: number;
  urlsFound: number;
  elapsedMs: number | null;
  ingestTotalDocs: number;
  ingestPendingDocs: number;
  ingestProcessingDocs: number;
  ingestReadyDocs: number;
  ingestFailedDocs: number;
  errorMessage: string | null;
};

function getPublisher(): Redis {
  if (!globalThis.__scrapeStreamPublisher) {
    globalThis.__scrapeStreamPublisher = new Redis(redisConnection);
  }
  return globalThis.__scrapeStreamPublisher;
}

function parseTimestampMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function readCrawlJobProgress(value: unknown): CrawlJobProgress | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CrawlJobProgress>;
  if (
    typeof candidate.percent !== "number" ||
    typeof candidate.urlsFound !== "number" ||
    typeof candidate.startedAtMs !== "number"
  ) {
    return null;
  }

  return {
    percent: candidate.percent,
    urlsFound: candidate.urlsFound,
    startedAtMs: candidate.startedAtMs,
  };
}

export function getScrapeSessionChannel(sessionId: string): string {
  return `${CHANNEL_PREFIX}${sessionId}`;
}

export function createScrapeSessionSubscriber(): Redis {
  return new Redis(redisConnection);
}

export async function publishScrapeSessionRefresh(sessionId: string): Promise<void> {
  await getPublisher().publish(getScrapeSessionChannel(sessionId), "refresh");
}

export async function buildScrapeStreamSnapshot(sessionId: string): Promise<ScrapeStreamSnapshot | null> {
  const session = await getSessionById(sessionId);
  if (!session) return null;

  const [urls, ingest] = await Promise.all([
    listUrlsForSession(sessionId),
    getSessionIngestProgress(sessionId),
  ]);

  let jobProgress = session.status === "discovering" ? 0 : 100;
  let urlsFound = session.totalUrls;
  let elapsedMs: number | null = null;

  if (session.status === "discovering" && session.jobId) {
    try {
      const job = await getCrawlQueue().getJob(session.jobId);
      if (job) {
        const progress = typeof job.progress === "function" ? await job.progress() : await job.progress;
        if (typeof progress === "number") {
          jobProgress = progress;
        } else {
          const meta = readCrawlJobProgress(progress);
          if (meta) {
            jobProgress = meta.percent;
            urlsFound = meta.urlsFound;
            elapsedMs = Math.max(0, Date.now() - meta.startedAtMs);
          }
        }
      }
    } catch {
      const startedAtMs = parseTimestampMs(session.createdAt);
      elapsedMs = startedAtMs != null ? Math.max(0, Date.now() - startedAtMs) : null;
    }
  }

  return {
    sessionId: session.id,
    rootUrl: session.rootUrl,
    status: session.status,
    cancelRequested: session.cancelRequested,
    totalUrls: session.totalUrls,
    selectedUrls: session.selectedUrls,
    scrapedUrls: session.scrapedUrls,
    failedUrls: session.failedUrls,
    pendingUrls: urls.filter((url) => url.status === "pending" && url.included).length,
    scrapingUrls: urls.filter((url) => url.status === "scraping").length,
    jobProgress,
    urlsFound,
    elapsedMs,
    ingestTotalDocs: ingest.totalDocs,
    ingestPendingDocs: ingest.pendingDocs,
    ingestProcessingDocs: ingest.processingDocs,
    ingestReadyDocs: ingest.readyDocs,
    ingestFailedDocs: ingest.failedDocs,
    errorMessage: session.errorMessage,
  };
}
