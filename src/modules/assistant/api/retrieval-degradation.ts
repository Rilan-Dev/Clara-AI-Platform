/**
 * src/modules/assistant/api/retrieval-degradation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Policy for chat turns whose knowledge-base retrieval failed at runtime
 * (embedding provider unreachable, credential rejected mid-flight, index
 * still rebuilding after the self-heal migration).
 *
 * Default: degrade gracefully. The turn is answered WITHOUT document
 * evidence, the model is told search is unavailable so it says so instead of
 * fabricating document contents, the client receives a retrieval_degraded
 * stream event it can banner, and the platform incident recorder still
 * notifies the admin. The published widget (/api/embed/chat) already behaves
 * this way — this module keeps the workspace chat consistent with it instead
 * of returning 502 on every turn while the backbone heals.
 *
 * Set CHAT_STRICT_RETRIEVAL=1 (or true/yes) to restore the strict behaviour
 * (HTTP 502 with the remediation message) for operators who prefer a hard
 * failure over an ungrounded answer.
 */

const STRICT_VALUES = new Set(["1", "true", "yes"]);

/** Whether the operator opted out of graceful retrieval degradation. */
export function isStrictRetrievalMode(): boolean {
  const raw = process.env.CHAT_STRICT_RETRIEVAL?.trim().toLowerCase();
  return raw != null && STRICT_VALUES.has(raw);
}

/** Instruction injected into the system prompt of a degraded turn. */
export function retrievalDegradationSystemNotice(): string {
  return (
    "[System notice] Knowledge-base search is temporarily unavailable for this assistant " +
    "(the embedding provider is failing). Answer from general knowledge only when you can do so safely, " +
    "tell the user that document search is unavailable right now, and do not fabricate document " +
    "contents, quotes, or citations."
  );
}

/** Public-safe stream event payload for a degraded turn (no provider internals). */
export function retrievalDegradationEvent(): { message: string } {
  return {
    message:
      "Document search is temporarily unavailable — answering without knowledge-base context.",
  };
}
