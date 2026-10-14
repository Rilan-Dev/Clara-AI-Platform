/**
 * src/modules/ai-governance/core/embedding-probe.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared configuration for embedding round-trip health probes (the ai-health
 * cron and any future monitor surface).
 *
 * Two rules the probe MUST share with the real retrieval path:
 *
 *   1. Probe the endpoint the GeminiProvider actually uses — honour
 *      GEMINI_BASE_URL. Without this, a deployment that routes Google traffic
 *      through a relay would see chat retrieval WORK while the cron keeps
 *      reporting the embedding backbone as down (and emailing the admin about
 *      a failure that no longer exists).
 *
 *   2. Never abort before the egress connect timeout. On slow international
 *      routes the operator raises EGRESS_CONNECT_TIMEOUT_MS precisely so
 *      provider traffic can connect at all — a probe that gives up EARLIER
 *      reports "down" while real requests would have succeeded (false
 *      critical incidents).
 */

/** Base URL for Gemini embedding round-trips (GEMINI_BASE_URL honoured). */
export function geminiEmbeddingBaseUrl(): string {
  const raw = process.env.GEMINI_BASE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString().replace(/\/+$/, "");
      }
      console.warn(`[ai-health] ignoring invalid GEMINI_BASE_URL "${raw}"`);
    } catch {
      console.warn(`[ai-health] ignoring invalid GEMINI_BASE_URL "${raw}"`);
    }
  }
  return "https://generativelanguage.googleapis.com";
}

/** Probe timeout: EMBEDDING_CHECK_TIMEOUT_MS, else egress timeout + 5s, else 10s. */
export function embeddingCheckTimeoutMs(): number {
  const tuned = Number(process.env.EMBEDDING_CHECK_TIMEOUT_MS);
  if (Number.isFinite(tuned) && tuned >= 1_000) return tuned;
  const egress = Number(process.env.EGRESS_CONNECT_TIMEOUT_MS);
  if (Number.isFinite(egress) && egress > 10_000) return egress + 5_000;
  return 10_000;
}
