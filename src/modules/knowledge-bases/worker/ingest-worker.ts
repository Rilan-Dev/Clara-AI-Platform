/**
 * src/modules/knowledge-bases/worker/ingest-worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Background ingest worker.
 *
 * One call to processNextJob() handles exactly one job:
 *   1. Claim a pending ingest_job atomically (SELECT FOR UPDATE SKIP LOCKED)
 *   2. Decode the file payload (base64 → Buffer)
 *   3. Parse the document (PDF / DOCX / TXT)
 *   4. Chunk the text
 *   5. Embed chunks + upsert to Qdrant with kbId + documentId in payload
 *   6. Mark document as 'ready' + job as 'done'
 *   7. On any error: mark document 'failed' + job failed/retry
 *
 * Called by:
 *   POST /api/worker/ingest  — triggered after each upload + by external cron
 */

import { ensureMigrated } from "@/lib/db/migrate";
import { recordEmbeddingRuntimeFailure } from "@/modules/platform-health/core/incidents";
import { parseDocumentFromBuffer } from "@/modules/admin/core/ingest/document-loader";
import { chunkText, chunkDocumentWithPages, chunkSectionAwareText } from "@/modules/admin/core/ingest/chunker";
import { resolveIngestChunkingFlags } from "./staging-chunking";
import { upsertDocumentsKb } from "@/modules/admin/core/vector-store-kb";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  claimPendingJobById,
  claimNextPendingJob,
  failOrphanedProcessingDocuments,
  finalizeUnclaimableIngestJobs,
  resetStaleIngestJobs,
  type IngestJobWithPayload,
  markJobDone,
  markJobFailed,
  updateDocumentStatus,
} from "@/modules/knowledge-bases/core/documents-db";

/** How long a 'running' job may stay unclaimed before recovery resets it. */
export const INGEST_STALE_JOB_MS = (() => {
  const v = Number(process.env.INGEST_STALE_JOB_MS ?? "600000");
  return Number.isFinite(v) && v > 0 ? v : 600_000;
})();

export type ProcessResult =
  | { status: "processed"; documentId: string; chunkCount: number }
  | { status: "idle" }
  | { status: "error"; error: string };

/** Small backoff between retries of failure-status DB writes. */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a tiny failure-status UPDATE with retries.
 *
 * These writes are the ONLY thing that moves a failed job/document out of
 * their in-flight states. When the database is flaky (pool exhaustion during
 * an embedding-provider outage — exactly when ingest jobs fail in bulk), a
 * single lost UPDATE orphans the pair forever: the job stays 'running', the
 * document stays 'pending'/'processing', and no poller can make progress on
 * them. Retrying these one-row writes makes orphaned states practically
 * impossible; the recovery passes in runIngestMaintenance() remain the
 * safety net for anything that still slips through (e.g. container kill).
 */
async function withStatusWriteRetry(
  label: string,
  write: () => Promise<void>,
  attempts = 3,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await write();
      return;
    } catch (err) {
      if (attempt >= attempts) {
        console.error(`[ingest-worker] ${label} status write failed after ${attempt} attempt(s):`, (err as Error).message);
        return;
      }
      await sleep(attempt === 1 ? 500 : 1500);
    }
  }
}

async function processClaimedJob(job: IngestJobWithPayload): Promise<ProcessResult> {
  const { documentId, kbId, id: jobId, filePayload } = job;

  // Chunks extracted from THIS run, kept for the failure path: when embedding
  // fails, persisting the count proves extraction worked and shows real
  // progress in the KB UI (Total Chunks) instead of a misleading 0.
  let extractedChunks: number | null = null;

  try {
    // Queue consumers are fresh Vercel functions and do not necessarily pass
    // through the normal app bootstrap. Load DB-backed provider credentials and
    // migrations before resolving the embedding provider.
    await ensureMigrated();

    if (!filePayload) {
      throw new Error("Job has no file payload — cannot process");
    }

    await updateDocumentStatus(documentId, "processing");

    const buffer = Buffer.from(filePayload.base64, "base64");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) throw new Error(`Knowledge base ${kbId} not found`);

    const parsed = await parseDocumentFromBuffer(buffer, filePayload.filename, filePayload.mimeType);

    if (!parsed.text?.trim()) {
      throw new Error("Document parsed successfully but contained no extractable text");
    }

    // Keep production flags untouched. A two-factor, exact-ID operator
    // override enables both experimental options ONLY for one active
    // RAG-STAGING-* KB; other tenant KBs retain the existing behavior.
    const { pageAware, sectionAware } = resolveIngestChunkingFlags(kb);
    const sourcedChunks = pageAware
      ? chunkDocumentWithPages(parsed, { sectionAware })
      : (sectionAware ? chunkSectionAwareText(parsed.text) : chunkText(parsed.text))
          .map((text) => ({ text }));
    const chunks = sourcedChunks.map((entry) => entry.text);
    if (chunks.length === 0) {
      throw new Error("Chunking produced 0 chunks — document may be empty or corrupt");
    }

    extractedChunks = chunks.length;

    console.log(
      `[ingest-worker] document ${documentId}: parsed ${parsed.text.length} chars → ${chunks.length} chunks`
    );

    await upsertDocumentsKb(kb.qdrantCollection, chunks, {
      kbId,
      documentId,
      title: parsed.title || filePayload.filename,
      originalFilename: filePayload.filename,
      ...(pageAware ? {
        chunkLocations: sourcedChunks.map((entry) => ({
          pageNumber: "pageNumber" in entry && typeof entry.pageNumber === "number"
            ? entry.pageNumber : undefined,
        })),
      } : {}),
    });

    await updateDocumentStatus(documentId, "ready", { chunkCount: chunks.length });
    await markJobDone(jobId);

    console.log(`[ingest-worker] ✅ job ${jobId} completed — ${chunks.length} chunks indexed`);
    return { status: "processed", documentId, chunkCount: chunks.length };

  } catch (err) {
    const message = (err as Error).message;
    console.error(`[ingest-worker] ❌ job ${jobId} failed:`, message);

    // Failure-status writes are retried: losing one to a flaky DB is how
    // documents end up orphaned in 'pending' with an unclaimable job.
    // The extracted chunk count rides along when parsing succeeded — the
    // document row then shows "extracted N chunks, embedding failed" instead
    // of looking like extraction never ran (owner-visible: Total Chunks).
    await withStatusWriteRetry(`document ${documentId}`, () =>
      updateDocumentStatus(documentId, "failed", {
        errorMessage: message,
        ...(extractedChunks != null ? { chunkCount: extractedChunks } : {}),
      })
    );

    const delaySec = 30 * Math.pow(2, job.attempts - 1);
    await withStatusWriteRetry(`job ${jobId}`, () =>
      markJobFailed(jobId, message, delaySec)
    );

    // The organisation sees a safe status message. Send embedding dependency
    // failures to the existing platform-admin incident/notification channel,
    // not to a tenant-facing screen or email. Preserve the raw diagnostics in
    // the internal ingest-job/document records for investigation.
    if (/Embedding failed|RESOURCE_EXHAUSTED|quota|rate.?limit|generativelanguage|embedding provider/i.test(message)) {
      await recordEmbeddingRuntimeFailure(err, {
        surface: "knowledge base document ingestion",
      });
    }

    return { status: "error", error: message };
  }
}

/**
 * Processes the next pending ingest job from the queue.
 * Returns immediately if no jobs are pending.
 */
export async function processNextJob(): Promise<ProcessResult> {
  const job = await claimNextPendingJob();
  if (!job) return { status: "idle" };

  return processClaimedJob(job);
}

export async function processJobById(jobId: string): Promise<ProcessResult> {
  const job = await claimPendingJobById(jobId);
  if (!job) return { status: "idle" };

  return processClaimedJob(job);
}

/**
 * One queue maintenance pass: recover interrupted jobs, then drain pending
 * work. Runs from the background poller and (fire-and-forget) after uploads.
 */
export async function runIngestMaintenance(maxJobs = 20): Promise<{
  processed: number;
  errors: number;
  recoveredJobs: number;
  recoveredDocuments: number;
}> {
  const recoveredJobs = await resetStaleIngestJobs(INGEST_STALE_JOB_MS).catch((err) => {
    console.error("[ingest-worker] stale job recovery failed:", (err as Error).message);
    return 0;
  });
  // Pending-but-unclaimable jobs are the direct cause of documents sitting in
  // 'pending' forever with the background worker seemingly idle. Finalize
  // them (and fail their documents) before the orphan pass so both agree.
  const finalizedDeadJobs = await finalizeUnclaimableIngestJobs().catch((err) => {
    console.error("[ingest-worker] dead-job finalization failed:", (err as Error).message);
    return 0;
  });
  const recoveredDocuments = await failOrphanedProcessingDocuments().catch((err) => {
    console.error("[ingest-worker] orphaned document recovery failed:", (err as Error).message);
    return 0;
  });
  const { processed, errors } = await drainQueue(maxJobs);
  return {
    processed,
    errors,
    recoveredJobs: recoveredJobs + finalizedDeadJobs,
    recoveredDocuments,
  };
}

/**
 * Fire-and-forget queue kick used after uploads and reprocess requests.
 *
 * This intentionally does NOT make an HTTP request back to this server: the
 * historical `${req.nextUrl.origin}/api/worker/ingest` self-fetch fails inside
 * Docker deployments where the public origin is not resolvable/reachable from
 * the container ("[upload] worker trigger failed: fetch failed"), which left
 * jobs unprocessed forever. Calling drainQueue() in-process is equivalent —
 * the claim is atomic (FOR UPDATE SKIP LOCKED) so the poller and concurrent
 * HTTP drains can never double-process the same job.
 */
export function kickIngestQueue(maxJobs = 20): void {
  runIngestMaintenance(maxJobs).catch((err) => {
    console.error("[ingest-worker] queue kick failed:", (err as Error).message);
  });
}

/**
 * Drain all pending jobs sequentially (useful for batch runs or cron).
 * Stops when the queue is empty or maxJobs is reached.
 */
export async function drainQueue(maxJobs = 20): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < maxJobs; i++) {
    const result = await processNextJob();
    if (result.status === "idle") break;
    if (result.status === "processed") processed++;
    if (result.status === "error") errors++;
  }

  return { processed, errors };
}

export async function processJobsById(
  jobIds: string[],
  options: {
    shouldStop?: () => Promise<boolean> | boolean;
    onProgress?: (progress: {
      total: number;
      processed: number;
      errors: number;
      currentJobId: string;
      result: ProcessResult;
    }) => Promise<void> | void;
  } = {}
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (const jobId of jobIds) {
    if (await options.shouldStop?.()) break;

    const result = await processJobById(jobId);
    if (result.status === "processed") processed++;
    if (result.status === "error") errors++;

    await options.onProgress?.({
      total: jobIds.length,
      processed,
      errors,
      currentJobId: jobId,
      result,
    });
  }

  return { processed, errors };
}
