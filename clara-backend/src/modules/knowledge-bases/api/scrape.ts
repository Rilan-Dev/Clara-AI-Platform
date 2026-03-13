/**
 * src/modules/knowledge-bases/api/scrape.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Route handlers for the web scraping pipeline.
 *
 * POST   /api/kbs/:kbId/scrape/discover              → discoverHandler
 * GET    /api/kbs/:kbId/scrape/sessions              → listSessionsHandler
 * GET    /api/kbs/:kbId/scrape/sessions/:sessionId   → getSessionHandler
 * PATCH  /api/kbs/:kbId/scrape/urls/:urlId           → toggleUrlHandler
 * PATCH  /api/kbs/:kbId/scrape/urls/batch            → batchToggleUrlHandler
 * POST   /api/kbs/:kbId/scrape/sessions/:sid/start   → startScrapeHandler
 * GET    /api/kbs/:kbId/scrape/sessions/:sid/progress→ progressHandler
 *
 * Discovery is async (BullMQ):
 *   1. POST /discover  → creates session (status='discovering'), enqueues job, returns 202 immediately
 *   2. Worker runs crawlWebsite() in background (no HTTP timeout)
 *   3. Worker transitions session to 'awaiting_confirmation'
 *   4. Frontend polls GET /sessions/:id every 2s until status changes
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
  recalcSessionProgress,
  listUrlsForSession,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { crawlQueue } from "@/modules/queue";

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerScrapeWorker(req: NextRequest, sessionId: string): void {
  try {
    const origin = req.nextUrl.origin;
    const secret = process.env.WORKER_SECRET ?? "";
    fetch(`${origin}/api/worker/scrape`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      body:    JSON.stringify({ sessionId }),
    }).catch((e) => console.warn("[scrape] worker trigger failed:", e.message));
  } catch (e) {
    console.warn("[scrape] worker trigger error:", (e as Error).message);
  }
}

// ── POST /api/kbs/:kbId/scrape/discover ──────────────────────────────────────
//
// Body:
//   url               string   — root URL to crawl
//   maxDepth?         number   — BFS depth (default: 3)
//   maxUrls?          number   — URL cap (default: 500)
//   requestDelayMs?   number   — ms between requests (default: 300)
//   scopeToInputPath? boolean  — restrict to input path prefix (default: true)
//
// Returns: 202 Accepted + session object (status='discovering')
//   The crawl runs in a background BullMQ worker.
//   Poll GET /sessions/:sessionId until status='awaiting_confirmation'.

export async function discoverHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    if (kb.status !== "active") {
      return NextResponse.json({ error: "Knowledge base is archived" }, { status: 400 });
    }

    const body = await req.json();
    const {
      url,
      maxDepth         = 3,
      maxUrls          = 500,
      requestDelayMs   = 300,
      scopeToInputPath = true,
    } = body;

    if (!url?.trim()) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    try { new URL(url); } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // ── Create session (status = 'discovering') ───────────────────────────────
    const session = await createSession({
      kbId,
      rootUrl:   url.trim(),
      maxDepth,
      createdBy: auth.user.id,
    });

    // ── Enqueue background crawl job — returns in < 100ms ─────────────────────
    const job = await crawlQueue.add("discover", {
      sessionId:       session.id,
      kbId,
      url:             url.trim(),
      maxDepth,
      maxUrls,
      requestDelayMs,
      scopeToInputPath: Boolean(scopeToInputPath),
    });

    console.log(
      `[scrape] Enqueued crawl job ${job.id} for session ${session.id} (${url.trim()})`
    );

    // ── Return 202 immediately — frontend polls for completion ────────────────
    return NextResponse.json(
      { ...session, jobId: job.id },
      { status: 202 }
    );

  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[scrape] discover:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions ───────────────────────────────────────

export async function listSessionsHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

    const sessions = await listSessionsForKb(kbId);
    return NextResponse.json(sessions);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions/:sessionId ────────────────────────────

export async function getSessionHandler(
  req: NextRequest,
  kbId: string,
  sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const session = await getSessionWithUrls(sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH /api/kbs/:kbId/scrape/urls/:urlId ──────────────────────────────────

export async function toggleUrlHandler(
  req: NextRequest,
  kbId: string,
  urlId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const body = await req.json();
    if (typeof body?.included !== "boolean") {
      return NextResponse.json({ error: "included (boolean) is required" }, { status: 400 });
    }

    const scrapeUrl = await getUrlById(urlId);
    if (!scrapeUrl) {
      return NextResponse.json({ error: "URL not found" }, { status: 404 });
    }

    const session = await getSessionById(scrapeUrl.sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "URL not found" }, { status: 404 });
    }

    const updated = await setUrlInclusion(urlId, body.included);
    await recalcSessionProgress(scrapeUrl.sessionId);

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH /api/kbs/:kbId/scrape/urls/batch ───────────────────────────────────

export async function batchToggleUrlHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const body = await req.json();

    if (body?.selectAll !== undefined && body?.sessionId) {
      const session = await getSessionById(body.sessionId);
      if (!session || session.kbId !== kbId) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      await selectAllUrls(body.sessionId, Boolean(body.selectAll));
      await recalcSessionProgress(body.sessionId);
      return NextResponse.json({ updated: true });
    }

    const { urlIds, included } = body ?? {};
    if (!Array.isArray(urlIds) || typeof included !== "boolean") {
      return NextResponse.json(
        { error: "urlIds (array) and included (boolean) are required" },
        { status: 400 }
      );
    }

    const count = await batchSetUrlInclusion(urlIds, included);
    return NextResponse.json({ updatedCount: count });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/kbs/:kbId/scrape/sessions/:sessionId/start ─────────────────────

export async function startScrapeHandler(
  req: NextRequest,
  kbId: string,
  sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "awaiting_confirmation") {
      return NextResponse.json(
        { error: `Cannot start scrape — session status is '${session.status}'` },
        { status: 400 }
      );
    }

    await markSessionScraping(sessionId);
    triggerScrapeWorker(req, sessionId);

    return NextResponse.json({ started: true, sessionId });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/scrape/sessions/:sessionId/progress ───────────────────

export async function progressHandler(
  req: NextRequest,
  kbId: string,
  sessionId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

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
