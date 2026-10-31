/**
 * src/modules/knowledge-bases/api/documents.ts
 * Route handlers for document upload, list, status polling, and delete.
 *
 * POST   /api/kbs/:kbId/documents          → upload 1-N files
 * GET    /api/kbs/:kbId/documents          → list documents with status
 * GET    /api/kbs/:kbId/documents/:docId   → single document (status poll)
 * DELETE /api/kbs/:kbId/documents/:docId   → delete document + Qdrant chunks
 * POST   /api/kbs/:kbId/documents/:docId/reprocess → re-queue failed document
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { publicKnowledgeProcessingError } from "@/modules/knowledge-bases/core/public-processing-error";
import { unexpectedKnowledgeApiError } from "./unexpected-error";
import { query } from "@/lib/db";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { planGuard, planLimitResponse } from "@/lib/plan-guard";
import { hit, rateLimitResponse, UPLOAD_RATE } from "@/lib/rate-limit";
import { scanUpload, VirusScanUnavailableError } from "@/modules/ingest/virus-scan";
import { writeAuditLog } from "@/modules/auth/core/db";
import {
  createDocument,
  createIngestJob,
  listDocuments,
  getDocumentById,
  deleteDocument,
  updateDocumentStatus,
  getDocumentJobStatus,
} from "@/modules/knowledge-bases/core/documents-db";
import { deleteDocumentChunks } from "@/modules/admin/core/vector-store-kb";
import { getGraphStore } from "@/modules/graph/core/graph-store";
import { scopedGraphKbId } from "@/modules/graph/core/graph-scope";
import { invalidateGraphSnapshot } from "@/modules/graph/core/graph-readiness";
import { INGEST_STALE_JOB_MS } from "@/modules/knowledge-bases/worker/ingest-worker";
import { enqueueIngestJob } from "@/modules/cloud-jobs/queue";

/**
 * Job started_at staleness check shared by the reprocess endpoints.
 * A 'running' job older than the stale window is treated as crashed —
 * the reprocess endpoint resets it instead of returning a dead-end 400.
 */
function isJobStale(startedAt: string | null): boolean {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  return Number.isFinite(started) && Date.now() - started >= INGEST_STALE_JOB_MS;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Allowed MIME types — includes HTML for direct upload of scraped pages
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/xhtml+xml",
]);

// ── POST /api/kbs/:kbId/documents ────────────────────────────────────────────

export async function uploadDocumentsHandler(
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

    // Resolve the owning org for plan-limit enforcement (kb → agent → org).
    const orgRows = await query<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
      [kbId]
    );
    const orgId = orgRows[0]?.org_id ?? null;

    // ── Phase 6.4: upload rate limit (10 req / min / org) ──────────────────
    // Applied per request (not per file) BEFORE parsing the multipart body,
    // so oversized bursts never reach formData() or plan-limit queries.
    {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip") ?? "unknown";
      const gate = hit(`upload:${orgId ? `org:${orgId}` : `ip:${ip}`}`, UPLOAD_RATE.limit, UPLOAD_RATE.windowMs);
      if (!gate.allowed) {
        const rl = rateLimitResponse(gate.retryAfterSec, "Upload request limit reached. Please try again shortly.");
        return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
      }
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Request must be multipart/form-data" }, { status: 400 });
    }

    const fileEntries = formData.getAll("files");
    if (!fileEntries.length) {
      const single = formData.get("file");
      if (single) fileEntries.push(single);
    }
    if (!fileEntries.length) {
      return NextResponse.json(
        { error: "No files found. Use field name 'files' (or 'file' for single upload)" },
        { status: 400 }
      );
    }

    // ── Plan limit: documents per knowledge base ───────────────────────────
    if (orgId) {
      const docsGuard = await planGuard(orgId, "docs_per_kb", { kbId });
      if (!docsGuard.allowed) return planLimitResponse(docsGuard) as NextResponse;
    }

    // ── Plan limit: total storage across the org (this batch included) ────
    const incomingBytes = fileEntries.reduce(
      (sum, entry) => sum + (entry instanceof File ? entry.size : 0),
      0
    );
    if (orgId) {
      const storageGuard = await planGuard(orgId, "storage", { incomingBytes });
      if (!storageGuard.allowed) return planLimitResponse(storageGuard) as NextResponse;
    }

    const results: { document: Awaited<ReturnType<typeof createDocument>>; jobId: string }[] = [];
    const errors: { filename: string; error: string; code: string }[] = [];

    for (const entry of fileEntries) {
      if (!(entry instanceof File)) {
        errors.push({ filename: "(unknown)", error: "Invalid file entry", code: "INVALID_FILE_ENTRY" });
        continue;
      }

      const filename = entry.name;
      const mimeType = entry.type || guessMimeType(filename);

      if (!ALLOWED_TYPES.has(mimeType) && !isAllowedExtension(filename)) {
        errors.push({
          filename,
          error: `Unsupported file type: ${mimeType || "unknown"}. Allowed: PDF, DOCX, XLSX, XLS, TXT, MD, CSV, HTML`,
          code: "INVALID_FILE_TYPE",
        });
        continue;
      }

      if (entry.size > MAX_FILE_BYTES) {
        errors.push({
          filename,
          error: `File too large (${Math.round(entry.size / 1024 / 1024)}MB). Max 50MB.`,
          code: "FILE_TOO_LARGE",
        });
        continue;
      }

      try {
        const arrayBuffer = await entry.arrayBuffer();

        // ── Phase 6.1: virus scan hook (no-op unless VIRUS_SCAN_URL is set) ──
        // Scanned BEFORE persistence: an infected file never reaches the
        // documents table, object storage, or the ingest pipeline.
        try {
          const scan = await scanUpload(Buffer.from(arrayBuffer), filename);
          if (!scan.clean) {
            errors.push({
              filename,
              error: "File rejected by the document security scan.",
              code: "MALWARE_DETECTED",
            });
            continue;
          }
        } catch (scanErr) {
          if (scanErr instanceof VirusScanUnavailableError) {
            return NextResponse.json(
              { error: "Document security scanning is temporarily unavailable. Please try later.", code: "VIRUS_SCAN_UNAVAILABLE", status: 503 },
              { status: 503 }
            );
          }
          throw scanErr;
        }

        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || filename;

        const doc = await createDocument({
          kbId,
          title,
          originalFilename: filename,
          mimeType: mimeType || undefined,
          fileSize: entry.size,
          uploadedBy: auth.user.id,
        });

        const job = await createIngestJob(doc.id, kbId, {
          base64,
          mimeType: mimeType || "application/octet-stream",
          filename,
        });

        results.push({ document: doc, jobId: job.id });
      } catch (fileErr) {
        console.error("[documents] upload file:", fileErr);
        errors.push({ filename, error: "The document could not be uploaded. Please retry later.", code: "UPLOAD_FAILED" });
      }
    }

    if (results.length > 0) {
      // The document and its ingest job are already stored; a queueing
      // failure must not turn a successful upload into a 500. Pending jobs
      // are also picked up by the ingest poller / maintenance run.
      const queued = await Promise.allSettled(results.map((result) => enqueueIngestJob(result.jobId)));
      for (const outcome of queued) {
        if (outcome.status === "rejected") {
          console.error("[documents] enqueue ingest failed — job stays pending:", (outcome.reason as Error)?.message ?? outcome.reason);
        }
      }
    }

    // WS-1.4: mutation audit — every accepted upload is on record.
    if (results.length > 0) {
      void writeAuditLog({
        userId: auth.user.id,
        orgId,
        action: "document.upload",
        resourceType: "knowledge_base",
        resourceId: kbId,
        newData: {
          accepted: results.map((r) => ({ id: r.document.id, title: r.document.title, size: r.document.fileSize })),
          rejected: errors,
        },
      }).catch(() => undefined);
    }

    const status = results.length > 0 ? 202 : 400;
    // Phase 6.3 error contract: when every file was rejected, surface the
    // first rejection as the headline { error, code } so clients (and the
    // Phase 6 acceptance suite) see 400 + INVALID_FILE_TYPE directly.
    const body: Record<string, unknown> =
      { queued: results.map((r) => ({ ...r.document, jobId: r.jobId })), errors };
    if (results.length === 0 && errors.length > 0) {
      body.error = errors[0]!.error;
      body.code = errors[0]!.code;
    }
    return NextResponse.json(body, { status });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[documents] upload:", err);
    return unexpectedKnowledgeApiError(err, "documents");
  }
}

// ── GET /api/kbs/:kbId/documents ─────────────────────────────────────────────

export async function listDocumentsHandler(req: NextRequest, kbId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");
    const docs = await listDocuments(kbId);
    // Keep raw failure diagnostics stored for platform operations, never return
    // them to organisation-facing document APIs.
    return NextResponse.json(docs.map((doc) => ({
      ...doc,
      errorMessage: publicKnowledgeProcessingError(doc.errorMessage, "document"),
    })));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return unexpectedKnowledgeApiError(err, "documents");
  }
}

// ── GET /api/kbs/:kbId/documents/:docId ──────────────────────────────────────

export async function getDocumentHandler(
  req: NextRequest, kbId: string, docId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");
    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const job = await getDocumentJobStatus(docId);
    return NextResponse.json({
      ...doc,
      errorMessage: publicKnowledgeProcessingError(doc.errorMessage, "document"),
      // This status response never needs the original ingest file payload:
      // preserve it server-side for Retry but omit it from the response.
      job: job
        ? {
            ...job,
            filePayload: undefined,
            errorMessage: publicKnowledgeProcessingError(job.errorMessage, "document"),
          }
        : null,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return unexpectedKnowledgeApiError(err, "documents");
  }
}

// ── DELETE /api/kbs/:kbId/documents/:docId ───────────────────────────────────

export async function deleteDocumentHandler(
  req: NextRequest, kbId: string, docId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:delete");
    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      // Keep the source record when its vector collection cannot be resolved.
      // Otherwise the document vanishes from the UI with no way to retry
      // cleaning up its Qdrant points.
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }
    // In an explicitly enabled graph pilot, remove the graph provenance
    // before deleting the source record. If Neo4j is down, keep the source
    // and vector evidence so deletion can be retried safely.
    if (process.env.GRAPH_STORE_PROVIDER === "neo4j" &&
        process.env.ENABLE_GRAPH_INDEXING === "true") {
      await getGraphStore("neo4j").deleteDocument(scopedGraphKbId(kbId, kb.qdrantCollection), docId);
    }
    if (process.env.ENABLE_RAG_RETRIEVAL_POLICY === "true") {
      await invalidateGraphSnapshot(kbId, kb.qdrantCollection);
    }
    await deleteDocumentChunks(kb.qdrantCollection, docId, kbId);
    await deleteDocument(docId);
    // WS-1.4: mutation audit — destructive action on tenant content.
    void writeAuditLog({
      userId: auth.user.id,
      orgId: (await orgIdFor(kbId)) ?? undefined,
      action: "document.delete",
      resourceType: "document",
      resourceId: docId,
      newData: { kbId, title: doc.title },
    }).catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return unexpectedKnowledgeApiError(err, "documents");
  }
}

// ── POST /api/kbs/:kbId/documents/:docId/reprocess ───────────────────────────

export async function reprocessDocumentHandler(
  req: NextRequest, kbId: string, docId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");
    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const latestJob = await getDocumentJobStatus(docId);

    if (!latestJob) {
      return NextResponse.json(
        {
          error:
            "No ingest job exists for this document (its queue record was removed). " +
            "Please delete and re-upload the file.",
        },
        { status: 400 }
      );
    }

    // A genuinely active job → tell the user to wait, don't dead-end them.
    if (latestJob.status === "running" && !isJobStale(latestJob.startedAt)) {
      return NextResponse.json(
        {
          error:
            "This document is currently being processed. Wait for it to finish " +
            "(large files can take a few minutes) before retrying.",
        },
        { status: 409 }
      );
    }

    // A fresh pending job already exists — the background poller will pick it
    // up; kick the queue so it happens immediately.
    if (latestJob.status === "pending") {
      // Attempts-exhausted pending jobs can never be claimed again
      // (claimPendingJobById requires attempts < max_attempts) — the enqueue
      // below would be a silent no-op and the document would sit in 'pending'
      // forever. Retrying such a document must create a FRESH job.
      if (latestJob.attempts >= latestJob.maxAttempts) {
        if (!latestJob.filePayload) {
          await updateDocumentStatus(docId, "failed", {
            errorMessage: latestJob.errorMessage ?? "Ingest attempts exhausted",
          });
          return NextResponse.json(
            { error: "File payload has been cleared — please re-upload the document" },
            { status: 400 }
          );
        }
        await updateDocumentStatus(docId, "pending");
        const freshJob = await createIngestJob(docId, kbId, latestJob.filePayload);
        await enqueueIngestJob(freshJob.id);
        return NextResponse.json({ document: { ...doc, status: "pending", errorMessage: null }, jobId: freshJob.id });
      }
      await enqueueIngestJob(latestJob.id);
      return NextResponse.json({ document: { ...doc, status: "pending", errorMessage: null }, jobId: latestJob.id });
    }

    if (!latestJob.filePayload) {
      return NextResponse.json(
        { error: "File payload has been cleared — please re-upload the document" }, { status: 400 }
      );
    }

    await updateDocumentStatus(docId, "pending");
    const newJob = await createIngestJob(docId, kbId, latestJob.filePayload!);
    await enqueueIngestJob(newJob.id);
    return NextResponse.json({ document: { ...doc, status: "pending", errorMessage: null }, jobId: newJob.id });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[documents] reprocess:", err);
    return NextResponse.json(
      { error: "The document could not be retried right now. Please try again later or contact support." },
      { status: 500 },
    );
  }
}

export async function reprocessAllDocumentsHandler(
  req: NextRequest,
  kbId: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    }

    const docs = await listDocuments(kbId);
    const details: Array<{
      documentId: string;
      title: string;
      status: "queued" | "skipped" | "failed";
      error?: string;
    }> = [];

    let queued = 0;
    let skipped = 0;
    let failed = 0;

    for (const doc of docs) {
      if (doc.status === "pending" || doc.status === "processing") {
        skipped += 1;
        details.push({
          documentId: doc.id,
          title: doc.title,
          status: "skipped",
          error: "Document is already processing.",
        });
        continue;
      }

      try {
        const latestJob = await getDocumentJobStatus(doc.id);
        if (!latestJob || latestJob.status === "running") {
          skipped += 1;
          details.push({
            documentId: doc.id,
            title: doc.title,
            status: "skipped",
            error: "No reusable ingest payload is available yet.",
          });
          continue;
        }

        if (!latestJob.filePayload) {
          skipped += 1;
          details.push({
            documentId: doc.id,
            title: doc.title,
            status: "skipped",
            error: "Original upload payload is missing. Re-upload this file to rebuild vectors.",
          });
          continue;
        }

        await updateDocumentStatus(doc.id, "pending");
        await createIngestJob(doc.id, kbId, latestJob.filePayload);
        queued += 1;
        details.push({
          documentId: doc.id,
          title: doc.title,
          status: "queued",
        });
      } catch (err) {
        failed += 1;
        details.push({
          documentId: doc.id,
          title: doc.title,
          status: "failed",
          error: publicKnowledgeProcessingError((err as Error).message, "document") ?? "The document could not be retried.",
        });
      }
    }

    if (queued > 0) {
      const pendingJobs = await Promise.all(
        docs
          .filter((doc) => doc.status === "failed" || doc.status === "ready")
          .map(async (doc) => getDocumentJobStatus(doc.id))
      );
      await Promise.all(
        pendingJobs
          .filter((job): job is NonNullable<typeof job> => Boolean(job?.id) && job?.status === "pending")
          .map((job) => enqueueIngestJob(job.id))
      );
    }

    return NextResponse.json({
      total: docs.length,
      queued,
      skipped,
      failed,
      details,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[documents] reprocess-all:", err);
    return NextResponse.json(
      { error: "The documents could not be retried right now. Please try again later or contact support." },
      { status: 500 },
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf:   "application/pdf",
    docx:  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx:  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls:   "application/vnd.ms-excel",
    txt:   "text/plain",
    md:    "text/markdown",
    csv:   "text/csv",
    html:  "text/html",
    htm:   "text/html",
    xhtml: "application/xhtml+xml",
  };
  return map[ext] ?? "";
}

function isAllowedExtension(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "docx", "xlsx", "xls", "txt", "md", "csv", "html", "htm", "xhtml"].includes(ext);
}

/** Best-effort org resolution for mutation audit rows (kb → agent → org). */
async function orgIdFor(kbId: string): Promise<string | null> {
  try {
    const { query } = await import("@/lib/db");
    const rows = await query<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kb ON kb.agent_id = a.id WHERE kb.id = $1`,
      [kbId],
    );
    return rows[0]?.org_id ?? null;
  } catch {
    return null;
  }
}
