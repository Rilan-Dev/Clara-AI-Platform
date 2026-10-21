/**
 * Tenant-safe knowledge processing status.
 *
 * The ingest and re-index workers intentionally retain original provider
 * diagnostics for platform operations. A KB member must not receive SDK
 * payloads, provider hosts, quotas, credentials or backend traces through
 * document/job/status APIs. Use fixed, actionable copy only.
 */
export function publicKnowledgeProcessingError(
  error: string | null | undefined,
  operation: "document" | "reindex",
): string | null {
  if (!error) return null;

  const limited = /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota|billing|too many requests|retryDelay/i.test(error);
  const unavailable = /\b(401|403|500|502|503|504)\b|API key|permission.denied|unavailable|timeout|ECONN|ENOTFOUND|fetch failed|Embedding failed/i.test(error);

  if (operation === "reindex") {
    if (limited) {
      return "The knowledge index update is paused because the processing service has reached a limit. Your existing index remains available. Please try Resume later. The platform team can investigate.";
    }
    return "The knowledge index update was interrupted. Your existing index remains available. Please try Resume later or contact support.";
  }

  if (limited) {
    return "This document could not be processed because the knowledge service is temporarily at capacity. Your file is safe. Please try Retry later or contact support.";
  }
  if (unavailable) {
    return "This document could not be processed because a knowledge service is temporarily unavailable. Please try Retry later or contact support.";
  }
  return "This document could not be processed. Please try Retry, or contact support if the problem continues.";
}
