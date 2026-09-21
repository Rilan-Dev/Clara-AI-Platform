import { handleCallback } from "@vercel/queue";
import {
  enqueueScrapeJob,
} from "@/modules/cloud-jobs/queue";
import { runScrapeSession } from "@/modules/knowledge-bases/worker/scrape-worker";
import { getSessionIngestProgress } from "@/modules/knowledge-bases/core/documents-db";
import {
  getSessionById,
  markSessionCompleted,
  markSessionFailed,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { publishScrapeSessionRefresh } from "@/modules/knowledge-bases/core/scrape-progress-stream";

export const maxDuration = 300;

type Message = {
  sessionId: string;
  action?: "run" | "finalize";
};

export const POST = handleCallback(async (message: Message) => {
  if (!message?.sessionId) throw new Error("Invalid scrape queue message");

  if (message.action === "finalize") {
    const session = await getSessionById(message.sessionId);
    if (!session || session.cancelRequested || session.status === "failed") return;

    const ingest = await getSessionIngestProgress(message.sessionId);
    if (ingest.pendingDocs > 0 || ingest.processingDocs > 0) {
      await enqueueScrapeJob(`${message.sessionId}:finalize:${Date.now()}`, message, { delaySeconds: 10 });
      return;
    }

    if (ingest.readyDocs > 0) {
      await markSessionCompleted(message.sessionId);
    } else {
      await markSessionFailed(
        message.sessionId,
        "No scraped documents were successfully added to the knowledge base",
      );
    }
    await publishScrapeSessionRefresh(message.sessionId).catch(() => null);
    return;
  }

  const result = await runScrapeSession(message.sessionId, {
    concurrency: 2,
    maxUrls: 10,
  });

  if (result.hasMore) {
    await enqueueScrapeJob(
      `${message.sessionId}:run:${Date.now()}`,
      { sessionId: message.sessionId, action: "run" },
    );
  } else {
    await enqueueScrapeJob(
      `${message.sessionId}:finalize`,
      { sessionId: message.sessionId, action: "finalize" },
      { delaySeconds: 5 },
    );
  }
}, { visibilityTimeoutSeconds: 300 });
