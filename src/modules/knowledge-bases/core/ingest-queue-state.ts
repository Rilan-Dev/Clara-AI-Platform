export const INGEST_STUCK_THRESHOLD_MS = 30_000;

type QueueDocument = {
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
};

/**
 * A document is only considered stuck while it is still waiting in the
 * pending queue. Once the worker has claimed it, `processing` is active work
 * and may legitimately take longer than 30 seconds for large documents.
 */
export function isPendingDocumentStuck(
  document: QueueDocument,
  now = Date.now(),
): boolean {
  if (document.status !== "pending") return false;

  const createdAt = Date.parse(document.createdAt);
  if (!Number.isFinite(createdAt)) return false;

  return now - createdAt >= INGEST_STUCK_THRESHOLD_MS;
}
