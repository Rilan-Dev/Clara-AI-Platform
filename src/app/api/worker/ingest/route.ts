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
 * Security (when WORKER_SECRET is set), any ONE of:
 *   X-Worker-Secret: <secret> header   — cron / internal triggers
 *   Valid authenticated session        — the UI "Process queue" button
 * If WORKER_SECRET is not set (local dev), the endpoint is open.
 *
 * The app's background poller also drains this queue continuously, so this
 * endpoint is now a manual/administrative accelerator rather than the
 * primary processing path.
 */
import { NextRequest, NextResponse } from "next/server";
import { processNextJob, runIngestMaintenance } from "@/modules/knowledge-bases/worker/ingest-worker";
import { requireAuth } from "@/modules/auth/core/rbac";

export const maxDuration = 300; // allow long-running jobs

async function handle(req: NextRequest): Promise<NextResponse> {
  // Security: prefer the shared worker secret (cron / internal triggers).
  // Authenticated admin/UI sessions are also accepted so the "Process queue"
  // button keeps working when WORKER_SECRET is configured — draining the queue
  // is idempotent and no more privileged than uploading a document.
  const workerSecret = process.env.WORKER_SECRET;
  if (workerSecret && req.headers.get("x-worker-secret") === workerSecret) {
    return drain(req);
  }
  if (workerSecret && !req.headers.get("x-worker-secret")) {
    try {
      await requireAuth(req);
      return drain(req);
    } catch {
      return NextResponse.json(
        { error: "Forbidden — provide X-Worker-Secret or an authenticated session" },
        { status: 403 },
      );
    }
  }
  return drain(req);
}

async function drain(req: NextRequest): Promise<NextResponse> {
  try {
    // GET always drains; POST drains when ?drain=true, otherwise single job
    const isDrain =
      req.method === "GET" ||
      req.nextUrl.searchParams.get("drain") === "true";

    if (isDrain) {
      // Maintenance also recovers stale/crashed jobs before draining.
      const stats = await runIngestMaintenance(50);
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
