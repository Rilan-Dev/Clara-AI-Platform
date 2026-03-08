/**
 * src/modules/knowledge-bases/core/documents-db.ts
 * PostgreSQL queries for documents and ingest_jobs tables.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, execute, pool } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";
export type JobStatus      = "pending" | "running" | "done" | "failed";

export type KbDocument = {
  id:               string;
  kbId:             string;
  title:            string;
  originalFilename: string;
  sourceType:       "upload" | "url" | "api";
  mimeType:         string | null;
  fileSize:         number | null;
  chunkCount:       number | null;
  status:           DocumentStatus;
  errorMessage:     string | null;
  uploadedBy:       string | null;
  createdAt:        string;
  updatedAt:        string;
};

export type IngestJob = {
  id:           string;
  documentId:   string;
  kbId:         string;
  status:       JobStatus;
  attempts:     number;
  maxAttempts:  number;
  errorMessage: string | null;
  scheduledAt:  string;
  startedAt:    string | null;
  completedAt:  string | null;
  createdAt:    string;
};

export type IngestJobWithPayload = IngestJob & {
  filePayload: { base64: string; mimeType: string; filename: string } | null;
};

// ── Row mappers ───────────────────────────────────────────────────────────────

function toDocument(row: Record<string, unknown>): KbDocument {
  return {
    id:               String(row.id),
    kbId:             String(row.kb_id),
    title:            String(row.title),
    originalFilename: String(row.original_filename),
    sourceType:       (row.source_type as KbDocument["sourceType"]) ?? "upload",
    mimeType:         row.mime_type != null ? String(row.mime_type) : null,
    fileSize:         row.file_size != null ? Number(row.file_size) : null,
    chunkCount:       row.chunk_count != null ? Number(row.chunk_count) : null,
    status:           (row.status as DocumentStatus) ?? "pending",
    errorMessage:     row.error_message != null ? String(row.error_message) : null,
    uploadedBy:       row.uploaded_by != null ? String(row.uploaded_by) : null,
    createdAt:        String(row.created_at),
    updatedAt:        String(row.updated_at),
  };
}

function toJob(row: Record<string, unknown>): IngestJob {
  return {
    id:           String(row.id),
    documentId:   String(row.document_id),
    kbId:         String(row.kb_id),
    status:       (row.status as JobStatus) ?? "pending",
    attempts:     Number(row.attempts),
    maxAttempts:  Number(row.max_attempts),
    errorMessage: row.error_message != null ? String(row.error_message) : null,
    scheduledAt:  String(row.scheduled_at),
    startedAt:    row.started_at != null ? String(row.started_at) : null,
    completedAt:  row.completed_at != null ? String(row.completed_at) : null,
    createdAt:    String(row.created_at),
  };
}

// ── Documents CRUD ────────────────────────────────────────────────────────────

export async function createDocument(input: {
  kbId:             string;
  title:            string;
  originalFilename: string;
  mimeType?:        string;
  fileSize?:        number;
  uploadedBy?:      string;
}): Promise<KbDocument> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO documents (id, kb_id, title, original_filename, mime_type, file_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, input.kbId, input.title, input.originalFilename, input.mimeType ?? null, input.fileSize ?? null, input.uploadedBy ?? null]
  );
  if (!row) throw new Error("Failed to create document");
  return toDocument(row);
}

export async function listDocuments(kbId: string): Promise<KbDocument[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM documents WHERE kb_id = $1 ORDER BY created_at DESC",
    [kbId]
  );
  return rows.map(toDocument);
}

export async function getDocumentById(id: string): Promise<KbDocument | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM documents WHERE id = $1",
    [id]
  );
  return row ? toDocument(row) : null;
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  extra?: { chunkCount?: number; errorMessage?: string }
): Promise<void> {
  await execute(
    `UPDATE documents SET status = $1, chunk_count = COALESCE($2, chunk_count), error_message = $3 WHERE id = $4`,
    [status, extra?.chunkCount ?? null, extra?.errorMessage ?? null, id]
  );
}

export async function deleteDocument(id: string): Promise<string | null> {
  // Returns kb_id for Qdrant cleanup
  const row = await queryOne<{ kb_id: string }>(
    "DELETE FROM documents WHERE id = $1 RETURNING kb_id",
    [id]
  );
  return row?.kb_id ?? null;
}

// ── Ingest Jobs ───────────────────────────────────────────────────────────────

export async function createIngestJob(
  documentId: string,
  kbId: string,
  filePayload: { base64: string; mimeType: string; filename: string }
): Promise<IngestJob> {
  const id = randomUUID();
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO ingest_jobs (id, document_id, kb_id, file_payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *`,
    [id, documentId, kbId, JSON.stringify(filePayload)]
  );
  if (!row) throw new Error("Failed to create ingest job");
  return toJob(row);
}

/**
 * Atomically claim the next pending ingest job.
 * Uses SELECT FOR UPDATE SKIP LOCKED so multiple workers never pick the same job.
 */
export async function claimNextPendingJob(): Promise<IngestJobWithPayload | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query<Record<string, unknown>>(
      `SELECT * FROM ingest_jobs
       WHERE status = 'pending'
         AND attempts < max_attempts
         AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE ingest_jobs
       SET status = 'running', started_at = now(), attempts = attempts + 1
       WHERE id = $1`,
      [row.id]
    );

    await client.query("COMMIT");

    const job = toJob({ ...row, status: "running", started_at: new Date().toISOString(), attempts: Number(row.attempts) + 1 });
    const rawPayload = row.file_payload as { base64: string; mimeType: string; filename: string } | null;
    return { ...job, filePayload: rawPayload };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markJobDone(jobId: string): Promise<void> {
  await execute(
    `UPDATE ingest_jobs
     SET status = 'done', completed_at = now(), file_payload = NULL
     WHERE id = $1`,
    [jobId]
  );
}

export async function markJobFailed(
  jobId: string,
  errorMessage: string,
  rescheduleDelay?: number   // seconds before retry — defaults to exponential backoff
): Promise<void> {
  const delaySeconds = rescheduleDelay ?? 30;
  await execute(
    `UPDATE ingest_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         error_message = $1,
         scheduled_at  = CASE WHEN attempts >= max_attempts THEN scheduled_at ELSE now() + ($2 || ' seconds')::interval END,
         completed_at  = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
     WHERE id = $3`,
    [errorMessage, delaySeconds, jobId]
  );
}

export async function getDocumentJobStatus(documentId: string): Promise<IngestJobWithPayload | null> {
  const row = await queryOne<Record<string, unknown>>(
    "SELECT * FROM ingest_jobs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1",
    [documentId]
  );
  if (!row) return null;
  const rawPayload = row.file_payload as { base64: string; mimeType: string; filename: string } | null;
  return { ...toJob(row), filePayload: rawPayload };
}
