/**
 * POST /api/worker/ingest
 * GET  /api/worker/ingest
 * ─────────────────────────────────────────────────────────────────────────────
 * Worker endpoint — drains the pending ingest_jobs queue.
 *
 * Query params:
 *   ?drain=true   — process ALL pending jobs (up to 50) — DEFAULT for GET
 *   (omitted)     — process the next single pending job
 *
 * Security: if WORKER_SECRET env var is set, requests must include:
 *   X-Worker-Secret: <secret>
 * If WORKER_SECRET is not set (local dev), the endpoint is open.
 */
import { NextRequest, NextResponse } from "next/server";
import { processNextJob, drainQueue } from "@/modules/knowledge-bases/worker/ingest-worker";

export const maxDuration = 300; // allow long-running jobs

async function handle(req: NextRequest): Promise<NextResponse> {
  // Validate worker secret only when explicitly configured
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret) {
    const incoming = req.headers.get("x-worker-secret");
    if (incoming !== workerSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    // GET always drains; POST drains when ?drain=true, otherwise single job
    const isDrain =
      req.method === "GET" ||
      req.nextUrl.searchParams.get("drain") === "true";

    if (isDrain) {
      const stats = await drainQueue(50);
      return NextResponse.json({ mode: "drain", ...stats });
    }

    const result = await processNextJob();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[worker/ingest]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export const POST = handle;
export const GET  = handle;
