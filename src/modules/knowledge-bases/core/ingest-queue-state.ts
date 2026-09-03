export const INGEST_STUCK_THRESHOLD_MS = 30_000;

type QueueDocument = {
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
};

/**
 * A document is stuck only while it is still pending in the queue.
 * A processing document is active work and may legitimately take longer
 * than 30 seconds for large documents or slow embedding providers.
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
