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
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import {
  createDocument,
  createIngestJob,
  listDocuments,
  getDocumentById,
  deleteDocument,
  updateDocumentStatus,
  getDocumentJobStatus,
  type IngestJobWithPayload,
} from "@/modules/knowledge-bases/core/documents-db";
import { deleteDocumentChunks } from "@/modules/admin/core/vector-store-kb";

/**
 * Triggers the ingest worker reliably in Next.js by making a self-HTTP call.
 * setImmediate/setTimeout are unreliable in Next.js App Router because the
 * runtime context can be torn down after the response is sent.
 * A detached fetch to the worker endpoint survives response completion.
 */
async function triggerWorker(req: NextRequest): Promise<void> {
  try {
    const origin = req.nextUrl.origin;
    const workerSecret = process.env.WORKER_SECRET;
    const headers: Record<string, string> = {};
    if (workerSecret) headers["x-worker-secret"] = workerSecret;

    // Fire-and-forget: don't await, don't let errors bubble up
    fetch(`${origin}/api/worker/ingest?drain=true`, {
      method: "GET",
      headers,
      // signal: no timeout — worker may take minutes for large batches
    }).catch((e) => console.warn("[upload] worker trigger failed:", e.message));
  } catch (e) {
    console.warn("[upload] failed to trigger worker:", (e as Error).message);
  }
}

// Max upload size per file: 50 MB (in bytes)
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

// ── POST /api/kbs/:kbId/documents ────────────────────────────────────────────

export async function uploadDocumentsHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // Auth & permission
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    if (kb.status !== "active") {
      return NextResponse.json({ error: "Knowledge base is archived" }, { status: 400 });
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Request must be multipart/form-data" },
        { status: 400 }
      );
    }

    // Collect all uploaded files
    const fileEntries = formData.getAll("files");
    if (!fileEntries.length) {
      // Also check singular "file" field for convenience
      const single = formData.get("file");
      if (single) fileEntries.push(single);
    }

    if (!fileEntries.length) {
      return NextResponse.json(
        { error: "No files found. Use field name 'files' (or 'file' for single upload)" },
        { status: 400 }
      );
    }

    const results: {
      document: Awaited<ReturnType<typeof createDocument>>;
      jobId: string;
      skipped?: string;
    }[] = [];

    const errors: { filename: string; error: string }[] = [];

    for (const entry of fileEntries) {
      if (!(entry instanceof File)) {
        errors.push({ filename: "(unknown)", error: "Invalid file entry" });
        continue;
      }

      const filename = entry.name;
      const mimeType = entry.type || guessMimeType(filename);

      // Validate type
      if (!ALLOWED_TYPES.has(mimeType) && !isAllowedExtension(filename)) {
        errors.push({
          filename,
          error: `Unsupported file type: ${mimeType || "unknown"}. Allowed: PDF, DOCX, TXT, MD, CSV`,
        });
        continue;
      }

      // Validate size
      if (entry.size > MAX_FILE_BYTES) {
        errors.push({
          filename,
          error: `File too large (${Math.round(entry.size / 1024 / 1024)}MB). Max 50MB.`,
        });
        continue;
      }

      try {
        // Read file as Buffer → base64 for queue storage
        const arrayBuffer = await entry.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");

        // Derive title from filename
        const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || filename;

        // Create document row (status = 'pending')
        const doc = await createDocument({
          kbId,
          title,
          originalFilename: filename,
          mimeType: mimeType || undefined,
          fileSize: entry.size,
          uploadedBy: auth.user.id,
        });

        // Enqueue ingest job (file content stored temporarily in JSONB)
        const job = await createIngestJob(doc.id, kbId, {
          base64,
          mimeType: mimeType || "application/octet-stream",
          filename,
        });

        results.push({ document: doc, jobId: job.id });
      } catch (fileErr) {
        errors.push({ filename, error: (fileErr as Error).message });
      }
    }

    // Trigger the ingest worker via self-HTTP (reliable in Next.js App Router).
    // setImmediate/setTimeout are NOT reliable because Next.js can tear down the
    // route handler context after the response is sent.
    if (results.length > 0) {
      triggerWorker(req);
    }

    const status = results.length > 0 ? 202 : 400;
    return NextResponse.json(
      {
        queued: results.map((r) => ({ ...r.document, jobId: r.jobId })),
        errors,
      },
      { status }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[documents] upload:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/documents ─────────────────────────────────────────────

export async function listDocumentsHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:read");

    const docs = await listDocuments(kbId);
    return NextResponse.json(docs);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/kbs/:kbId/documents/:docId ──────────────────────────────────────

export async function getDocumentHandler(
  req: NextRequest,
  kbId: string,
  docId: string
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
    return NextResponse.json({ ...doc, job });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE /api/kbs/:kbId/documents/:docId ───────────────────────────────────

export async function deleteDocumentHandler(
  req: NextRequest,
  kbId: string,
  docId: string
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
    if (kb) {
      // Delete this document's chunks from Qdrant (best-effort)
      await deleteDocumentChunks(kb.qdrantCollection, docId);
    }

    await deleteDocument(docId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/kbs/:kbId/documents/:docId/reprocess ───────────────────────────

export async function reprocessDocumentHandler(
  req: NextRequest,
  kbId: string,
  docId: string
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
    if (!latestJob || latestJob.status === "running") {
      return NextResponse.json(
        { error: "Document is already processing or no job found" },
        { status: 400 }
      );
    }

    if (!latestJob.filePayload) {
      return NextResponse.json(
        { error: "File payload has been cleared — please re-upload the document" },
        { status: 400 }
      );
    }

    // Reset document status and create new ingest job
    await updateDocumentStatus(docId, "pending");
    const newJob = await createIngestJob(docId, kbId, latestJob.filePayload!);

    triggerWorker(req);

    return NextResponse.json({ document: { ...doc, status: "pending" }, jobId: newJob.id });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf:  "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt:  "text/plain",
    md:   "text/markdown",
    csv:  "text/csv",
  };
  return map[ext] ?? "";
}

function isAllowedExtension(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "docx", "txt", "md", "csv"].includes(ext);
}
