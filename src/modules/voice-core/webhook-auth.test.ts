/**
 * Unit tests for the signed-callback verification layer of the ElevenLabs
 * integration (plan §11.3) — the Mode-B security boundary.
 *
 * Covers: internal tool-callback HMAC over timestamp+body, the ±5 min
 * timestamp window, the single-use nonce replay guard (DB-backed), and the
 * vendor post-call signature scheme. The DB layer is mocked so the crypto
 * contracts run in CI without Postgres.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

// ── DB mock (nonce ledger) ───────────────────────────────────────────────────

const queryMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  execute: (...args: unknown[]) => executeMock(...args),
}));

import {
  signInternalToolCall,
  verifyInternalToolCall,
  verifyVendorWebhookSignature,
} from "./webhook-auth";

const SECRET = "test_tool_hmac_secret_0123456789";
const WEBHOOK_SECRET = "test_webhook_secret_0123456789";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

function nonceLedgerAllows(): void {
  // INSERT ... ON CONFLICT DO NOTHING RETURNING TRUE → row present = fresh.
  queryMock.mockResolvedValueOnce([{ inserted: true }]);
}

describe("verifyInternalToolCall", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_TOOL_HMAC_SECRET", SECRET);
    queryMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const body = JSON.stringify({ orgId: "o1", kbId: "k1", query: "what is the refund policy?" });

  function signedHeaders(timestampMs: number, nonce = "nonce-12345678"): Headers {
    const signature = signInternalToolCall(SECRET, body, timestampMs);
    return headers({
      "x-clara-signature": signature,
      "x-clara-timestamp": String(timestampMs),
      "x-clara-nonce": nonce,
    });
  }

  it("accepts a correctly signed, fresh, single-use callback", async () => {
    nonceLedgerAllows();
    const result = await verifyInternalToolCall(body, signedHeaders(Date.now()));
    expect(result.verified).toBe(true);
  });

  it("rejects an unsigned request (missing_signature)", async () => {
    const result = await verifyInternalToolCall(body, headers({}));
    expect(result).toMatchObject({ verified: false, failure: "missing_signature" });
  });

  it("rejects a tampered body under a captured signature (bad_signature)", async () => {
    const signature = signInternalToolCall(SECRET, body, Date.now());
    const result = await verifyInternalToolCall(
      body.replace("refund", "RETURN"), // different bytes, same signature
      headers({
        "x-clara-signature": signature,
        "x-clara-timestamp": String(Date.now()),
        "x-clara-nonce": "nonce-12345678",
      }),
    );
    expect(result).toMatchObject({ verified: false, failure: "bad_signature" });
  });

  it("rejects a stale timestamp outside the ±5 min window", async () => {
    const stale = Date.now() - 6 * 60 * 1000;
    const result = await verifyInternalToolCall(body, signedHeaders(stale));
    expect(result).toMatchObject({ verified: false, failure: "stale_timestamp" });
  });

  it("rejects a far-future timestamp (clock-rollback replay)", async () => {
    const future = Date.now() + 6 * 60 * 1000;
    const result = await verifyInternalToolCall(body, signedHeaders(future));
    expect(result).toMatchObject({ verified: false, failure: "stale_timestamp" });
  });

  it("rejects a replayed nonce (replayed_nonce)", async () => {
    // Ledger returns no row → nonce already consumed.
    queryMock.mockResolvedValueOnce([]);
    const result = await verifyInternalToolCall(body, signedHeaders(Date.now()));
    expect(result).toMatchObject({ verified: false, failure: "replayed_nonce" });
  });

  it("fails closed when the nonce ledger errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));
    const result = await verifyInternalToolCall(body, signedHeaders(Date.now()));
    expect(result).toMatchObject({ verified: false, failure: "replayed_nonce" });
  });

  it("rejects a missing or malformed nonce as a bad signature", async () => {
    const timestamp = Date.now();
    const signature = signInternalToolCall(SECRET, body, timestamp);
    const result = await verifyInternalToolCall(body, headers({
      "x-clara-signature": signature,
      "x-clara-timestamp": String(timestamp),
      // nonce header absent
    }));
    expect(result).toMatchObject({ verified: false, failure: "bad_signature" });
  });

  it("reports missing_secret when the platform has no HMAC secret configured", async () => {
    vi.stubEnv("ELEVENLABS_TOOL_HMAC_SECRET", "");
    const result = await verifyInternalToolCall(body, signedHeaders(Date.now()));
    expect(result).toMatchObject({ verified: false, failure: "missing_secret" });
  });
});

describe("verifyVendorWebhookSignature", () => {
  it("accepts the vendor signature over the raw body", () => {
    const body = JSON.stringify({ data: { conversation_id: "c1", agent_id: "a1" } });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex");
    const result = verifyVendorWebhookSignature(body, headers({ "elevenlabs-signature": signature }), WEBHOOK_SECRET);
    expect(result.verified).toBe(true);
  });

  it("rejects a body mutated after signing", () => {
    const body = JSON.stringify({ data: { conversation_id: "c1", agent_id: "a1" } });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex");
    const result = verifyVendorWebhookSignature(body + " ", headers({ "elevenlabs-signature": signature }), WEBHOOK_SECRET);
    expect(result).toMatchObject({ verified: false, failure: "bad_signature" });
  });

  it("rejects requests without the signature header", () => {
    const result = verifyVendorWebhookSignature("{}", headers({}), WEBHOOK_SECRET);
    expect(result).toMatchObject({ verified: false, failure: "missing_signature" });
  });

  it("reports missing_secret when the webhook secret is unconfigured", () => {
    const result = verifyVendorWebhookSignature("{}", headers({ "elevenlabs-signature": "ab" }), undefined);
    expect(result).toMatchObject({ verified: false, failure: "missing_secret" });
  });
});
