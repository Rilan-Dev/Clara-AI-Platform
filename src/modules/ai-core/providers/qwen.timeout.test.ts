/**
 * src/modules/ai-core/providers/qwen.timeout.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch-scaled abort ceiling for the local Qwen embeddings server.
 *
 * Production regression this pins: the flat 30s timeout aborted every
 * 20-chunk re-index batch at exactly 30.0s (net-trace: "POST
 * http://qwen-embeddings:8080/v1/embeddings · 30002ms") because CPU-bound
 * inference on the 2-core container needs ~3.6s per chunk (~72s for 20).
 * The re-index job then failed with "embedding provider unreachable" and
 * knowledge bases stayed stuck at 0%.
 */
import { describe, expect, it } from "vitest";
import { qwenRequestTimeoutMs } from "./qwen";

describe("qwenRequestTimeoutMs", () => {
  it("keeps the 30s floor for single-input queries", () => {
    expect(qwenRequestTimeoutMs(1, {})).toBe(30_000);
    expect(qwenRequestTimeoutMs(0, {})).toBe(30_000);
    expect(qwenRequestTimeoutMs(-3, {})).toBe(30_000);
  });

  it("scales the abort ceiling with batch size so re-index batches complete", () => {
    // 20 chunks measured ~72s in production — the ceiling must exceed that.
    expect(qwenRequestTimeoutMs(20, {})).toBe(10_000 + 20 * 8_000);
    expect(qwenRequestTimeoutMs(20, {})).toBeGreaterThan(72_000);
    expect(qwenRequestTimeoutMs(6, {})).toBe(30_000 + 28_000); // 58s > 21.7s measured
  });

  it("honours an explicit QWEN_EMBEDDINGS_TIMEOUT_MS override", () => {
    expect(qwenRequestTimeoutMs(20, { QWEN_EMBEDDINGS_TIMEOUT_MS: "60000" })).toBe(60_000);
    expect(qwenRequestTimeoutMs(1, { QWEN_EMBEDDINGS_TIMEOUT_MS: "120000" })).toBe(120_000);
  });

  it("ignores invalid overrides and falls back to the scaled ceiling", () => {
    expect(qwenRequestTimeoutMs(20, { QWEN_EMBEDDINGS_TIMEOUT_MS: "abc" })).toBe(170_000);
    expect(qwenRequestTimeoutMs(20, { QWEN_EMBEDDINGS_TIMEOUT_MS: "-5" })).toBe(170_000);
    expect(qwenRequestTimeoutMs(20, { QWEN_EMBEDDINGS_TIMEOUT_MS: "0" })).toBe(170_000);
  });
});
