/**
 * GET /api/worker/reindex — advance queued/running knowledge-index jobs.
 *
 * Vercel Cron calls this (vercel.json); on the VPS the in-process poller does
 * the same work, and an open status panel also advances its own job. Jobs
 * are lease-protected, so overlapping triggers never double-process a page.
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel Cron) or X-Worker-Secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { advanceAllReindexJobs } from "@/modules/knowledge-bases/core/reindex";

export const maxDuration = 300;

function authorised(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  const worker = process.env.WORKER_SECRET;
  if (cron && req.headers.get("authorization") === `Bearer ${cron}`) return true;
  if (worker && req.headers.get("x-worker-secret") === worker) return true;
  return !cron && !worker && process.env.NODE_ENV !== "production";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorised(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const jobs = await advanceAllReindexJobs(240_000);
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    console.error("[worker/reindex]", error);
    return NextResponse.json({ error: "Re-index worker failed" }, { status: 500 });
  }
}
