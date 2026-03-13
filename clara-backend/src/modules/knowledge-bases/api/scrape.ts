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
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
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
  listUrlsForSession,
  setSessionJobId,
  findActiveSession,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { getCrawlQueue, type CrawlJobProgress } from "@/modules/queue";
import { runScrapeSession } from "@/modules/knowledge-bases/worker/scrape-worker";

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerScrapeWorker(sessionId: string): void {
  queueMicrotask(() => {
    void runScrapeSession(sessionId, { concurrency: 2 }).catch(async (e) => {
      const message = (e as Error).message;
      console.error(`[scrape] background worker failed for session ${sessionId}:`, message);
      await markSessionFailed(sessionId, `Scrape failed: ${message}`).catch(() => null);
    });
  });
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

    const job = await getCrawlQueue().add("discover", {
      sessionId: session.id, kbId, url: url.trim(),
      maxDepth, maxUrls, requestDelayMs, scopeToInputPath: Boolean(scopeToInputPath),
    });

    await setSessionJobId(session.id, job.id!);

    console.log(`[scrape] Enqueued crawl job ${job.id} for session ${session.id} (${url.trim()})`);

    return NextResponse.json({ ...session, jobId: job.id }, { status: 202 });
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

    // If already past discovering, return completion signal
    if (session.status !== "discovering") {
      return NextResponse.json({
        status:      session.status,
        jobProgress: 100,
        urlsFound:   session.totalUrls,
        elapsedMs:   null,
      });
    }

    // Query BullMQ job progress
    let jobProgress = 0;
    let urlsFound = session.totalUrls;
    let startedAtMs: number | null = null;

    if (session.jobId) {
      try {
        const job = await getCrawlQueue().getJob(session.jobId);
        if (job) {
          const prog = await job.progress;
          if (typeof prog === "number") {
            jobProgress = prog;
          } else {
            const progressMeta = readCrawlJobProgress(prog);
            if (progressMeta) {
              jobProgress = progressMeta.percent;
              urlsFound = progressMeta.urlsFound;
              startedAtMs = progressMeta.startedAtMs;
            }
          }
        }
      } catch { /* Redis may be briefly unavailable */ }
    }

    const fallbackStartedAtMs = parseTimestampMs(session.createdAt);
    const elapsedOrigin = startedAtMs ?? fallbackStartedAtMs;
    const elapsedMs = elapsedOrigin != null ? Math.max(0, Date.now() - elapsedOrigin) : null;

    return NextResponse.json({
      status:      session.status,
      jobProgress,
      urlsFound,
      elapsedMs,
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
    triggerScrapeWorker(sessionId);
    return NextResponse.json({ started: true, sessionId });
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
    const urls = await listUrlsForSession(sessionId);
    return NextResponse.json({
      sessionId:    session.id,
      status:       session.status,
      totalUrls:    session.totalUrls,
      selectedUrls: session.selectedUrls,
      scrapedUrls:  session.scrapedUrls,
      failedUrls:   session.failedUrls,
      pendingUrls:  urls.filter((u) => u.status === "pending" && u.included).length,
      scrapingUrls: urls.filter((u) => u.status === "scraping").length,
      errorMessage: session.errorMessage,
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
    const count = await batchSetUrlInclusion(urlIds, included);
    return NextResponse.json({ updatedCount: count });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
