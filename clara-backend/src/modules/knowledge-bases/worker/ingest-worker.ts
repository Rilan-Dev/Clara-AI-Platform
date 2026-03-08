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

import { parseDocumentFromBuffer } from "@/modules/admin/core/ingest/document-loader";
import { chunkText } from "@/modules/admin/core/ingest/chunker";
import { upsertDocumentsKb } from "@/modules/admin/core/vector-store-kb";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  claimNextPendingJob,
  markJobDone,
  markJobFailed,
  updateDocumentStatus,
} from "@/modules/knowledge-bases/core/documents-db";

export type ProcessResult =
  | { status: "processed"; documentId: string; chunkCount: number }
  | { status: "idle" }
  | { status: "error"; error: string };

/**
 * Processes the next pending ingest job from the queue.
 * Returns immediately if no jobs are pending.
 */
export async function processNextJob(): Promise<ProcessResult> {
  const job = await claimNextPendingJob();
  if (!job) return { status: "idle" };

  const { documentId, kbId, id: jobId, filePayload } = job;

  try {
    if (!filePayload) {
      throw new Error("Job has no file payload — cannot process");
    }

    // 1. Mark document as processing
    await updateDocumentStatus(documentId, "processing");

    // 2. Decode base64 → Buffer
    const buffer = Buffer.from(filePayload.base64, "base64");

    // 3. Load KB to get collection name
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) throw new Error(`Knowledge base ${kbId} not found`);

    // 4. Parse document
    const parsed = await parseDocumentFromBuffer(buffer, filePayload.filename, filePayload.mimeType);

    if (!parsed.text?.trim()) {
      throw new Error("Document parsed successfully but contained no extractable text");
    }

    // 5. Chunk
    const chunks = chunkText(parsed.text);
    if (chunks.length === 0) {
      throw new Error("Chunking produced 0 chunks — document may be empty or corrupt");
    }

    console.log(
      `[ingest-worker] document ${documentId}: parsed ${parsed.text.length} chars → ${chunks.length} chunks`
    );

    // 6. Embed + upsert to Qdrant (kbId + documentId in every chunk payload)
    await upsertDocumentsKb(kb.qdrantCollection, chunks, {
      kbId,
      documentId,
      title: parsed.title || filePayload.filename,
      originalFilename: filePayload.filename,
    });

    // 7. Mark document ready
    await updateDocumentStatus(documentId, "ready", { chunkCount: chunks.length });
    await markJobDone(jobId);

    console.log(`[ingest-worker] ✅ job ${jobId} completed — ${chunks.length} chunks indexed`);
    return { status: "processed", documentId, chunkCount: chunks.length };

  } catch (err) {
    const message = (err as Error).message;
    console.error(`[ingest-worker] ❌ job ${jobId} failed:`, message);

    await updateDocumentStatus(documentId, "failed", { errorMessage: message });

    // Exponential back-off: 30s, 60s, 120s
    const delaySec = 30 * Math.pow(2, job.attempts - 1);
    await markJobFailed(jobId, message, delaySec);

    return { status: "error", error: message };
  }
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
