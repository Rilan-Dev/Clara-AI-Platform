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
  markSessionAwaiting,
  markSessionFailed,
  insertDiscoveredUrls,
  recalcSessionProgress,
  listUrlsForSession,
} from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { crawlWebsite } from "@/modules/ingest/crawlers/web-crawler";

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
    const { url, maxDepth = 3, maxUrls = 200, requestDelayMs = 500 } = body;

    if (!url?.trim()) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Validate the URL
    try { new URL(url); } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Create the session row immediately (status = 'discovering')
    const session = await createSession({
      kbId,
      rootUrl:   url.trim(),
      maxDepth,
      createdBy: auth.user.id,
    });

    // Run the crawler synchronously (it's fast for typical sites, ≤30s)
    // For very large sites, this could be moved to a background worker.
    try {
      const crawlResult = await crawlWebsite(url.trim(), {
        maxDepth,
        maxUrls,
        requestDelayMs,
        concurrency: 3,
      });

      // Bulk-insert all discovered URLs
      await insertDiscoveredUrls(
        session.id,
        crawlResult.discoveredUrls.map((u) => ({
          url:           u.url,
          title:         u.title,
          depth:         u.depth,
          parentUrl:     u.parentUrl ?? undefined,
          contentLength: u.contentLength,
        }))
      );

      // Recalc counters + mark awaiting user confirmation
      await recalcSessionProgress(session.id);
      await markSessionAwaiting(session.id);

      // Return the session with all URLs for immediate UI rendering
      const full = await getSessionWithUrls(session.id);
      return NextResponse.json(full, { status: 201 });

    } catch (crawlErr) {
      const msg = (crawlErr as Error).message;
      await markSessionFailed(session.id, msg);
      return NextResponse.json(
        { error: `Crawl failed: ${msg}`, sessionId: session.id },
        { status: 422 }
      );
    }

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

    // Verify the URL belongs to this KB
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

    // selectAll mode: include/exclude all URLs in the session
    if (body?.selectAll !== undefined && body?.sessionId) {
      const session = await getSessionById(body.sessionId);
      if (!session || session.kbId !== kbId) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      await selectAllUrls(body.sessionId, Boolean(body.selectAll));
      await recalcSessionProgress(body.sessionId);
      return NextResponse.json({ updated: true });
    }

    // Batch specific URL IDs
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

    // Mark session as scraping
    await markSessionScraping(sessionId);

    // Fire-and-forget: trigger the scrape worker
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

    const summary = {
      sessionId:    session.id,
      status:       session.status,
      totalUrls:    session.totalUrls,
      selectedUrls: session.selectedUrls,
      scrapedUrls:  session.scrapedUrls,
      failedUrls:   session.failedUrls,
      pendingUrls:  urls.filter((u) => u.status === "pending" && u.included).length,
      scrapingUrls: urls.filter((u) => u.status === "scraping").length,
      errorMessage: session.errorMessage,
    };

    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
