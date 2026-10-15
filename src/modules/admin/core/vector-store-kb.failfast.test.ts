/**
 * Fail-fast classification tests for embedding provider reachability.
 *
 * When the embedding endpoint is connect-level unreachable (the live incident:
 * generativelanguage.googleapis.com:443 connect timeout), the ingest worker
 * must stop after ONE batch instead of grinding every remaining batch through
 * the same 20s connect timeout — a 295-chunk document used to burn 20+
 * minutes per attempt, generating the DB/Qdrant load storm that failed
 * unrelated page requests (the "documents disappeared" symptom).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./vector-store", () => ({
  getQdrantClient: vi.fn(),
  ensureCollectionExists: vi.fn(async () => undefined),
}));
vi.mock("@/modules/ai-core/factory", () => ({
  ProviderFactory: { getProvider: vi.fn(() => ({ getProviderName: () => "gemini", getModelName: () => "gemini-embedding-2-preview" })) },
}));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logUsageEvent: vi.fn(async () => undefined),
}));
vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  copyCollectionEmbedding: vi.fn(),
  getActiveReindexJob: vi.fn(),
  getCollectionEmbedding: vi.fn(),
  getKbIndexContext: vi.fn(),
  providerConfigFor: vi.fn(),
  resolveWriteEmbedding: vi.fn(),
}));

import { isUnreachableEmbeddingError } from "./vector-store-kb";

/** Build the undici-style nested cause chain providers actually throw. */
function connectTimeoutError(host: string): Error {
  const cause = new Error(
    `Connect Timeout Error (attempted address: ${host}:443, timeout: 20000ms)`
  );
  (cause as Error & { code?: string }).code = "UND_ERR_CONNECT_TIMEOUT";
  const fetchFailed = new TypeError("fetch failed", { cause });
  return fetchFailed;
}

describe("isUnreachableEmbeddingError", () => {
  it("classifies undici connect-timeout cause chains as unreachable", () => {
    const err = connectTimeoutError("generativelanguage.googleapis.com");
    // The outermost message is "fetch failed"; the classifier must walk causes.
    expect(isUnreachableEmbeddingError(err)).toBe(true);
  });

  it("classifies DNS failures (ENOTFOUND) as unreachable", () => {
    const cause = new Error("getaddrinfo ENOTFOUND api.sarvam.ai");
    const err = new TypeError("fetch failed", { cause });
    expect(isUnreachableEmbeddingError(err)).toBe(true);
  });

  it("does NOT classify a bare 429 as unreachable (needs full retries)", () => {
    const err = new Error("429 Too Many Requests");
    expect(isUnreachableEmbeddingError(err)).toBe(false);
  });

  it("does NOT classify ordinary provider errors as unreachable", () => {
    const err = new Error("401 Incorrect API key provided");
    expect(isUnreachableEmbeddingError(err)).toBe(false);
  });
});
