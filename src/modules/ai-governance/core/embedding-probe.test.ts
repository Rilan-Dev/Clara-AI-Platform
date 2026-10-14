/**
 * src/modules/ai-governance/core/embedding-probe.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The health-probe configuration must track the REAL retrieval path:
 *  - GEMINI_BASE_URL relays are honoured (otherwise a working relay keeps
 *    being reported as "embedding backbone down" by the 24/7 monitor).
 *  - The probe timeout never aborts before the configured egress connect
 *    timeout (slow international routes would otherwise produce false
 *    critical incidents).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { embeddingCheckTimeoutMs, geminiEmbeddingBaseUrl } from "./embedding-probe";

const GUARDED_ENV_KEYS = [
  "GEMINI_BASE_URL",
  "EMBEDDING_CHECK_TIMEOUT_MS",
  "EGRESS_CONNECT_TIMEOUT_MS",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of GUARDED_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of GUARDED_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("geminiEmbeddingBaseUrl", () => {
  it("defaults to the Google AI Studio endpoint", () => {
    expect(geminiEmbeddingBaseUrl()).toBe("https://generativelanguage.googleapis.com");
  });

  it("honours a valid GEMINI_BASE_URL relay and strips trailing slashes", () => {
    process.env.GEMINI_BASE_URL = "https://gemini-relay.example.com/";
    expect(geminiEmbeddingBaseUrl()).toBe("https://gemini-relay.example.com");
  });

  it("ignores invalid relay values and falls back to the vendor endpoint", () => {
    process.env.GEMINI_BASE_URL = "not a url";
    expect(geminiEmbeddingBaseUrl()).toBe("https://generativelanguage.googleapis.com");
  });

  it("ignores unsupported protocols", () => {
    process.env.GEMINI_BASE_URL = "ftp://gemini-relay.example.com";
    expect(geminiEmbeddingBaseUrl()).toBe("https://generativelanguage.googleapis.com");
  });
});

describe("embeddingCheckTimeoutMs", () => {
  it("defaults to 10s", () => {
    expect(embeddingCheckTimeoutMs()).toBe(10_000);
  });

  it("never aborts before a raised egress connect timeout (+5s headroom)", () => {
    process.env.EGRESS_CONNECT_TIMEOUT_MS = "25000";
    expect(embeddingCheckTimeoutMs()).toBe(30_000);
  });

  it("keeps the 10s default when the egress timeout is lower", () => {
    process.env.EGRESS_CONNECT_TIMEOUT_MS = "5000";
    expect(embeddingCheckTimeoutMs()).toBe(10_000);
  });

  it("an explicit EMBEDDING_CHECK_TIMEOUT_MS wins over both", () => {
    process.env.EGRESS_CONNECT_TIMEOUT_MS = "25000";
    process.env.EMBEDDING_CHECK_TIMEOUT_MS = "12000";
    expect(embeddingCheckTimeoutMs()).toBe(12_000);
  });
});
