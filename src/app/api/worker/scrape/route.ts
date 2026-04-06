/**
 * POST /api/worker/scrape
 * ─────────────────────────────────────────────────────────────────────────────
 * Scrape worker endpoint — runs the full page-scrape + ingest-queue pipeline
 * for a confirmed scrape session.
 *
 * Body: { sessionId: string }
 *
 * Security: same X-Worker-Secret guard as /api/worker/ingest.
 * Called fire-and-forget by startScrapeHandler after the user confirms.
 */
import { NextRequest, NextResponse } from "next/server";
import { runScrapeSession } from "@/modules/knowledge-bases/worker/scrape-worker";

export const maxDuration = 300; // scraping many pages can take minutes

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate worker secret when configured
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret) {
    const incoming = req.headers.get("x-worker-secret");
    if (incoming !== workerSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const { sessionId } = body ?? {};

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const result = await runScrapeSession(sessionId, { concurrency: 2 });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[worker/scrape]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
