/**
 * src/modules/cloud-jobs/handlers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * What each background job does — shared by both transports:
 *   • Vercel Queues   → the /api/queue/* consumer routes
 *   • local (Docker / VPS / `next start`) → queue.ts runs them in-process
 *
 * Messages are published as a CloudJobEnvelope `{ jobId, kind, payload }`.
 * The job data lives in `payload`; unwrapPayload() also accepts a bare
 * object so messages queued before this envelope fix still process.
 */

import type { CloudJobEnvelope, CloudJobKind } from "./queue";

export function unwrapPayload<T extends object>(message: unknown): T {
  if (message && typeof message === "object") {
    const envelope = message as Partial<CloudJobEnvelope>;
    if (envelope.payload && typeof envelope.payload === "object") return envelope.payload as T;
  }
  return (message ?? {}) as T;
}

export async function handleIngestMessage(message: unknown): Promise<void> {
  const jobId = (message as { jobId?: string } | null)?.jobId;
  if (!jobId) throw new Error("Invalid ingest queue message: jobId is required");
  const { processJobById } = await import("@/modules/knowledge-bases/worker/ingest-worker");
  const result = await processJobById(jobId);
  if (result.status === "error") throw new Error(result.error);
}

export async function handleCrawlMessage(message: unknown): Promise<void> {
  const { processCrawlJobData } = await import("./process-crawl");
  const data = unwrapPayload<Parameters<typeof processCrawlJobData>[0]>(message);
  if (!data?.sessionId || !data.url) throw new Error("Invalid crawl queue message");
  await processCrawlJobData(data);
}

export async function handleRetryMessage(message: unknown): Promise<void> {
  const { processRetryJobData } = await import("./process-retry");
  const data = unwrapPayload<Parameters<typeof processRetryJobData>[0]>(message);
  if (!data?.retryRecordId || !data.scrapeUrlId || !data.sessionId) throw new Error("Invalid retry queue message");
  await processRetryJobData(data);
}

type ScrapeMessage = { sessionId?: string; action?: "run" | "finalize" };

export async function handleScrapeMessage(message: unknown): Promise<void> {
  const data = unwrapPayload<ScrapeMessage>(message);
  const sessionId = data?.sessionId;
  if (!sessionId) throw new Error("Invalid scrape queue message");

  const { enqueueScrapeJob } = await import("./queue");
  const sessions = await import("@/modules/knowledge-bases/core/scrape-sessions-db");
  const { getSessionIngestProgress } = await import("@/modules/knowledge-bases/core/documents-db");
  const { publishScrapeSessionRefresh } = await import("@/modules/knowledge-bases/core/scrape-progress-stream");

  if (data.action === "finalize") {
    const session = await sessions.getSessionById(sessionId);
    if (!session || session.cancelRequested || session.status === "failed") return;

    const ingest = await getSessionIngestProgress(sessionId);
    if (ingest.pendingDocs > 0 || ingest.processingDocs > 0) {
      await enqueueScrapeJob(`${sessionId}:finalize:${Date.now()}`, { sessionId, action: "finalize" }, { delaySeconds: 10 });
      return;
    }

    if (ingest.readyDocs > 0) await sessions.markSessionCompleted(sessionId);
    else await sessions.markSessionFailed(sessionId, "No scraped documents were successfully added to the knowledge base");
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    return;
  }

  const { runScrapeSession } = await import("@/modules/knowledge-bases/worker/scrape-worker");
  const result = await runScrapeSession(sessionId, { concurrency: 2, maxUrls: 2 });
  if (result.hasMore) {
    await enqueueScrapeJob(`${sessionId}:run:${Date.now()}`, { sessionId, action: "run" });
  } else {
    await enqueueScrapeJob(`${sessionId}:finalize`, { sessionId, action: "finalize" }, { delaySeconds: 5 });
  }
}

export async function dispatchCloudJob(kind: CloudJobKind, message: unknown): Promise<void> {
  switch (kind) {
    case "ingest": return handleIngestMessage(message);
    case "crawl":  return handleCrawlMessage(message);
    case "scrape": return handleScrapeMessage(message);
    case "retry":  return handleRetryMessage(message);
  }
}
