/**
 * src/modules/knowledge-bases/api/scrape.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Route handlers for the web scraping pipeline.
 *
 * POST /api/kbs/:kbId/scrape/discover               → discoverHandler
 * GET  /api/kbs/:kbId/scrape/active-session         → activeSessionHandler
 * GET  /api/kbs/:kbId/scrape/sessions               → listSessionsHandler
 * GET  /api/kbs/:kbId/scrape/sessions/:id           → getSessionHandler
 * GET  /api/kbs/:kbId/scrape/sessions/:id/discover-progress → discoverProgressHandler
 * GET  /api/kbs/:kbId/scrape/sessions/:id/progress  → progressHandler
 * POST /api/kbs/:kbId/scrape/sessions/:id/start     → startScrapeHandler
 * PATCH /api/kbs/:kbId/scrape/urls/:urlId           → toggleUrlHandler
 * PATCH /api/kbs/:kbId/scrape/urls/batch            → batchToggleUrlHandler
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { deleteDocumentChunks } from "@/modules/admin/core/vector-store-kb";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  countRunningIngestJobsForSession,
  deleteDocument,
  listRollbackDocumentsForSession,
} from "@/modules/knowledge-bases/core/documents-db";
import {
  buildScrapeStreamSnapshot,
  createScrapeSessionSubscriber,
  getScrapeSessionChannel,
  publishScrapeSessionRefresh,
} from "@/modules/knowledge-bases/core/scrape-progress-stream";
import {
  createSession,
  getSessionById,
  getSessionWithUrls,
  listSessionsForKb,
  setUrlInclusion,
  batchSetUrlInclusion,
  selectAllUrls,
  getUrlById,
  markSessionScraping,
  markSessionFailed,
  recalcSessionProgress,
  rollbackSessionToAwaiting,
  deleteSession,
  setSessionCancelRequested,
  setSessionJobId,
  findActiveSession,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { getScrapeUrlRetryContext } from "@/modules/knowledge-bases/core/scrape-url-retry-db";
import { enqueueCrawlJob, enqueueScrapeJob } from "@/modules/cloud-jobs/queue";
import { scheduleImmediateRetryForUrl } from "@/modules/knowledge-bases/worker/retry-scheduler";
import type Redis from "ioredis";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rollbackSessionDocuments(kbId: string, sessionId: string): Promise<void> {
  const [kb, docs] = await Promise.all([
    getKnowledgeBaseById(kbId),
    listRollbackDocumentsForSession(sessionId),
  ]);

  if (!kb && docs.length > 0) {
    throw new Error("Knowledge base not found: cannot verify deletion of scraped vectors");
  }
  for (const doc of docs) {
    if (kb) {
      await deleteDocumentChunks(kb.qdrantCollection, doc.id, kbId);
    }
    await deleteDocument(doc.id);
  }
}

async function waitForSessionWorkersToStop(sessionId: string): Promise<boolean> {
  const session = await getSessionById(sessionId);
  if (!session) return true;

  // Discovery and document work are now durable cloud-queue messages.
  // Cancellation is persisted first; the consumer checks cancelRequested before
  // doing more work, so there is no in-process worker that needs draining here.
  if (session.status === "discovering") return true;

  const snapshot = await buildScrapeStreamSnapshot(sessionId);
  const scrapingBusy = (snapshot?.scrapingUrls ?? 0) > 0;
  const ingestBusy = await countRunningIngestJobsForSession(sessionId);
  return !scrapingBusy && ingestBusy === 0;
}

async function finalizeSessionCancellation(kbId: string, sessionId: string): Promise<void> {
  const ready = await waitForSessionWorkersToStop(sessionId);
  if (!ready) {
    setTimeout(() => {
      void finalizeSessionCancellation(kbId, sessionId);
    }, 1_000);
    return;
  }

  const session = await getSessionById(sessionId);
  if (!session) return;

  if (session.status === "discovering" || session.status === "awaiting_confirmation") {
    await deleteSession(sessionId);
    return;
  }

  await rollbackSessionDocuments(kbId, sessionId);
  await rollbackSessionToAwaiting(sessionId);
  await recalcSessionProgress(sessionId);
  await publishScrapeSessionRefresh(sessionId).catch(() => null);
}

// ── POST /api/kbs/:kbId/scrape/discover ──────────────────────────────────────
// Returns 202 immediately. Crawl runs in BullMQ worker.
// Frontend polls GET /sessions/:id every 2s until status != 'discovering'.

export async function discoverHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    if (kb.status !== "active")
      return NextResponse.json({ error: "Knowledge base is archived" }, { status: 400 });

    const body = await req.json();
    const { url, maxDepth = 3, maxUrls = 500, requestDelayMs = 300, scopeToInputPath = true } = body;

    if (!url?.trim()) return NextResponse.json({ error: "url is required" }, { status: 400 });
    try { new URL(url); } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const session = await createSession({ kbId, rootUrl: url.trim(), maxDepth, createdBy: auth.user.id });

    const queueResult = await enqueueCrawlJob(session.id, {
      sessionId: session.id,
      kbId,
      url: url.trim(),
      maxDepth,
      maxUrls,
      requestDelayMs,
      scopeToInputPath: Boolean(scopeToInputPath),
    });

    if (queueResult.messageId) {
      await setSessionJobId(session.id, queueResult.messageId);
    }

    console.log(`[scrape] Enqueued cloud crawl job ${queueResult.messageId ?? "deferred"} for session ${session.id} (${url.trim()})`);

    return NextResponse.json({ ...session, jobId: queueResult.messageId }, { status: 202 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[scrape] discover:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/active-session ─────────────────────────────────
// Returns the most recent in-progress session (discovering/scraping/awaiting).
// Called on page load so returning users immediately resume watching progress.

export async function activeSessionHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const session = await findActiveSession(kbId);
    if (!session) return NextResponse.json(null);

    // Include URLs only for awaiting_confirmation (needed for review step)
    if (session.status === "awaiting_confirmation") {
      const full = await getSessionWithUrls(session.id);
      return NextResponse.json(full);
    }
    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions/:id/discover-progress ─────────────────
// Polls BullMQ job progress (0-100) during the 'discovering' phase.
// Returns { jobProgress, urlsFound, status, elapsedMs }

export async function discoverProgressHandler(
  req: NextRequest, kbId: string, sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const snapshot = await buildScrapeStreamSnapshot(sessionId);
    if (!snapshot)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });

    if (snapshot.status !== "discovering") {
      return NextResponse.json({
        status:      snapshot.status,
        jobProgress: 100,
        urlsFound:   snapshot.totalUrls,
        elapsedMs:   null,
      });
    }

    return NextResponse.json({
      status:      snapshot.status,
      jobProgress: snapshot.jobProgress,
      urlsFound:   snapshot.urlsFound,
      elapsedMs:   snapshot.elapsedMs,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions ───────────────────────────────────────

export async function listSessionsHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    return NextResponse.json(await listSessionsForKb(kbId));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions/:id ───────────────────────────────────

export async function getSessionHandler(
  req: NextRequest, kbId: string, sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");
    const session = await getSessionWithUrls(sessionId);
    if (!session || session.kbId !== kbId)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/kbs/:kbId/scrape/sessions/:id/start ────────────────────────────

export async function startScrapeHandler(
  req: NextRequest, kbId: string, sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");
    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (session.status !== "awaiting_confirmation")
      return NextResponse.json(
        { error: `Cannot start — session status is '${session.status}'` }, { status: 400 }
      );
    await markSessionScraping(sessionId);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);
    const queueResult = await enqueueScrapeJob(
      `${sessionId}:run:${Date.now()}`,
      { sessionId, action: "run" },
    );
    return NextResponse.json({ started: true, sessionId, jobId: queueResult.messageId });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function encodeSsePayload(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function encodeSseHeartbeat(): Uint8Array {
  return new TextEncoder().encode(`: heartbeat\n\n`);
}

export async function streamHandler(
  req: NextRequest, kbId: string, sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const channel = getScrapeSessionChannel(sessionId);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const subscriber: Redis = createScrapeSessionSubscriber();
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        let closed = false;

        const closeStream = async () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          req.signal.removeEventListener("abort", abortHandler);
          try { await subscriber.unsubscribe(channel); } catch {}
          subscriber.disconnect();
          try { controller.close(); } catch {}
        };

        const sendSnapshot = async () => {
          if (closed) return;
          const snapshot = await buildScrapeStreamSnapshot(sessionId);
          if (!snapshot) {
            await closeStream();
            return;
          }
          controller.enqueue(encodeSsePayload(snapshot));
        };

        const abortHandler = () => { void closeStream(); };
        req.signal.addEventListener("abort", abortHandler);

        subscriber.on("message", (_incomingChannel, message) => {
          if (closed || message !== "refresh") return;
          void sendSnapshot();
        });

        await subscriber.subscribe(channel);
        await sendSnapshot();

        heartbeat = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encodeSseHeartbeat());
          } catch {
            void closeStream();
          }
        }, 15_000);
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions/:id/progress ──────────────────────────

export async function progressHandler(
  req: NextRequest, kbId: string, sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");
    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const snapshot = await buildScrapeStreamSnapshot(sessionId);
    if (!snapshot)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });

    return NextResponse.json({
      sessionId:            snapshot.sessionId,
      status:               snapshot.status,
      totalUrls:            snapshot.totalUrls,
      selectedUrls:         snapshot.selectedUrls,
      scrapedUrls:          snapshot.scrapedUrls,
      failedUrls:           snapshot.failedUrls,
      pendingUrls:          snapshot.pendingUrls,
      scrapingUrls:         snapshot.scrapingUrls,
      ingestTotalDocs:      snapshot.ingestTotalDocs,
      ingestPendingDocs:    snapshot.ingestPendingDocs,
      ingestProcessingDocs: snapshot.ingestProcessingDocs,
      ingestReadyDocs:      snapshot.ingestReadyDocs,
      ingestFailedDocs:     snapshot.ingestFailedDocs,
      errorMessage:         snapshot.errorMessage,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function cancelSessionHandler(
  req: NextRequest, kbId: string, sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "awaiting_confirmation") {
      await deleteSession(sessionId);
      return NextResponse.json({ rolledBackTo: "idle" });
    }

    if (session.status === "completed" || session.status === "failed") {
      await rollbackSessionDocuments(kbId, sessionId);
      await rollbackSessionToAwaiting(sessionId);
      await recalcSessionProgress(sessionId);
      const full = await getSessionWithUrls(sessionId);
      return NextResponse.json({ rolledBackTo: "awaiting_confirmation", session: full });
    }

    await setSessionCancelRequested(sessionId, true);
    await publishScrapeSessionRefresh(sessionId).catch(() => null);

    queueMicrotask(() => {
      void finalizeSessionCancellation(kbId, sessionId).catch((err) => {
        console.error(`[scrape] cancel rollback failed for session ${sessionId}:`, (err as Error).message);
      });
    });

    return NextResponse.json({
      cancelling: true,
      rolledBackTo: session.status === "discovering" ? "idle" : "awaiting_confirmation",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH /api/kbs/:kbId/scrape/urls/:urlId ──────────────────────────────────

export async function toggleUrlHandler(
  req: NextRequest, kbId: string, urlId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");
    const body = await req.json();
    if (typeof body?.included !== "boolean")
      return NextResponse.json({ error: "included (boolean) is required" }, { status: 400 });
    const scrapeUrl = await getUrlById(urlId);
    if (!scrapeUrl) return NextResponse.json({ error: "URL not found" }, { status: 404 });
    const session = await getSessionById(scrapeUrl.sessionId);
    if (!session || session.kbId !== kbId)
      return NextResponse.json({ error: "URL not found" }, { status: 404 });
    const updated = await setUrlInclusion(urlId, body.included);
    await recalcSessionProgress(scrapeUrl.sessionId);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH /api/kbs/:kbId/scrape/urls/batch ───────────────────────────────────

export async function batchToggleUrlHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");
    const body = await req.json();
    if (body?.selectAll !== undefined && body?.sessionId) {
      const session = await getSessionById(body.sessionId);
      if (!session || session.kbId !== kbId)
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      await selectAllUrls(body.sessionId, Boolean(body.selectAll));
      await recalcSessionProgress(body.sessionId);
      return NextResponse.json({ updated: true });
    }
    const { urlIds, included } = body ?? {};
    if (!Array.isArray(urlIds) || typeof included !== "boolean")
      return NextResponse.json(
        { error: "urlIds (array) and included (boolean) are required" }, { status: 400 }
      );
    const count = await batchSetUrlInclusion(kbId, urlIds, included);
    return NextResponse.json({ updatedCount: count });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function retryScrapeUrlHandler(
  req: NextRequest,
  kbId: string,
  urlId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const ctx = await getScrapeUrlRetryContext(urlId);
    if (!ctx || ctx.kbId !== kbId) {
      return NextResponse.json({ error: "URL not found" }, { status: 404 });
    }

    const result = await scheduleImmediateRetryForUrl(urlId);
    if (!result.scheduled) {
      return NextResponse.json({ error: result.reason ?? "Retry not scheduled" }, { status: 400 });
    }

    await publishScrapeSessionRefresh(ctx.sessionId).catch(() => null);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
