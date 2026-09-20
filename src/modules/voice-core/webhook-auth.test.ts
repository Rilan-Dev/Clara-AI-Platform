/**
 * Unit tests for the signed-callback verification layer of the ElevenLabs
 * integration (plan §11.3) — the Mode-B security boundary.
 *
 * Covers: the static-token tool-callback scheme (x-clara-tool-token), and
 * the vendor post-call signature schemes — the CURRENT Stripe-style
 * `t=…,v1=…` header (with timestamp tolerance + multi-v1 rotation) plus the
 * legacy plain-HMAC-over-body fallback. The DB layer stays mocked (the nonce
 * ledger is no longer in the verification path, but the module still imports
 * the DB client) so the crypto contracts run in CI without Postgres.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

// ── DB mock (module imports the pool for the nonce ledger helpers) ──────────

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
  WEBHOOK_TIMESTAMP_TOLERANCE_MS,
} from "./webhook-auth";

const SECRET = "test_tool_hmac_secret_0123456789";
const WEBHOOK_SECRET = "test_webhook_secret_0123456789";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("verifyInternalToolCall (static shared token)", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_TOOL_HMAC_SECRET", SECRET);
    queryMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const body = JSON.stringify({ query: "what is the refund policy?" });

  function tokenHeaders(token: string): Headers {
    return headers({ "x-clara-tool-token": token });
  }

  it("accepts a callback carrying the correct shared token", async () => {
    const result = await verifyInternalToolCall(body, tokenHeaders(SECRET));
    expect(result.verified).toBe(true);
  });

  it("rejects an unsigned request (missing_signature)", async () => {
    const result = await verifyInternalToolCall(body, headers({}));
    expect(result).toMatchObject({ verified: false, failure: "missing_signature" });
  });

  it("rejects a wrong token (bad_signature) — constant-time compared", async () => {
    const result = await verifyInternalToolCall(body, tokenHeaders(`wrong${SECRET.slice(5)}`));
    expect(result).toMatchObject({ verified: false, failure: "bad_signature" });
  });

  it("rejects an empty token header (missing_signature)", async () => {
    const result = await verifyInternalToolCall(body, tokenHeaders("   "));
    expect(result).toMatchObject({ verified: false, failure: "missing_signature" });
  });

  it("reports missing_secret when the platform has no shared token configured", async () => {
    vi.stubEnv("ELEVENLABS_TOOL_HMAC_SECRET", "");
    const result = await verifyInternalToolCall(body, tokenHeaders(SECRET));
    expect(result).toMatchObject({ verified: false, failure: "missing_secret" });
  });

  it("signInternalToolCall returns the secret (compose helper for e2e)", () => {
    expect(signInternalToolCall(SECRET)).toBe(SECRET);
  });
});

describe("verifyVendorWebhookSignature (Stripe-style t=/v1=)", () => {
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "c1", agent_id: "a1" } });

  function stripeSignature(timestampSec: number, secret = WEBHOOK_SECRET, extra = ""): string {
    const hmac = createHmac("sha256", secret).update(`${timestampSec}.${extra}${body}`, "utf8").digest("hex");
    return `t=${timestampSec},v1=${hmac}`;
  }

  it("accepts a current-scheme signature over the raw body", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = verifyVendorWebhookSignature(
      body,
      headers({ "elevenlabs-signature": stripeSignature(now) }),
      WEBHOOK_SECRET,
    );
    expect(result.verified).toBe(true);
  });

  it("accepts any v1 entry (secret rotation: multiple v1= values)", () => {
    const now = Math.floor(Date.now() / 1000);
    const rotated = stripeSignature(now, "rotated_webhook_secret_9876543210");
    const current = stripeSignature(now);
    const combined = `t=${now},v1=${rotated},v1=${current}`;
    const result = verifyVendorWebhookSignature(body, headers({ "elevenlabs-signature": combined }), WEBHOOK_SECRET);
    expect(result.verified).toBe(true);
  });

  it("accepts a timestamp at the edge of the tolerance window", () => {
    const edge = Math.floor((Date.now() - WEBHOOK_TIMESTAMP_TOLERANCE_MS + 5_000) / 1000);
    const result = verifyVendorWebhookSignature(
      body,
      headers({ "elevenlabs-signature": stripeSignature(edge) }),
      WEBHOOK_SECRET,
    );
    expect(result.verified).toBe(true);
  });

  it("rejects a stale timestamp outside the tolerance window (stale_timestamp)", () => {
    const stale = Math.floor((Date.now() - WEBHOOK_TIMESTAMP_TOLERANCE_MS - 60_000) / 1000);
    const result = verifyVendorWebhookSignature(
      body,
      headers({ "elevenlabs-signature": stripeSignature(stale) }),
      WEBHOOK_SECRET,
    );
    expect(result).toMatchObject({ verified: false, failure: "stale_timestamp" });
  });

  it("rejects a far-future timestamp (clock-rollback replay)", () => {
    const future = Math.floor((Date.now() + WEBHOOK_TIMESTAMP_TOLERANCE_MS + 60_000) / 1000);
    const result = verifyVendorWebhookSignature(
      body,
      headers({ "elevenlabs-signature": stripeSignature(future) }),
      WEBHOOK_SECRET,
    );
    expect(result).toMatchObject({ verified: false, failure: "stale_timestamp" });
  });

  it("rejects a body mutated after signing (bad_signature)", () => {
    const now = Math.floor(Date.now() / 1000);
    const signature = stripeSignature(now);
    const result = verifyVendorWebhookSignature(body + " ", headers({ "elevenlabs-signature": signature }), WEBHOOK_SECRET);
    expect(result).toMatchObject({ verified: false, failure: "bad_signature" });
  });

  it("rejects requests without the signature header", () => {
    const result = verifyVendorWebhookSignature("{}", headers({}), WEBHOOK_SECRET);
    expect(result).toMatchObject({ verified: false, failure: "missing_signature" });
  });

  it("reports missing_secret when the webhook secret is unconfigured", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = verifyVendorWebhookSignature(
      body,
      headers({ "elevenlabs-signature": stripeSignature(now) }),
      undefined,
    );
    expect(result).toMatchObject({ verified: false, failure: "missing_secret" });
  });

  // ── Legacy fallback: plain hex HMAC over the raw body ──────────────────────

  it("accepts a legacy plain-HMAC signature over the raw body", () => {
    const legacy = createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex");
    const result = verifyVendorWebhookSignature(body, headers({ "elevenlabs-signature": legacy }), WEBHOOK_SECRET);
    expect(result.verified).toBe(true);
  });

  it("rejects a legacy signature computed with the wrong secret", () => {
    const legacy = createHmac("sha256", "another_secret_entirely").update(body, "utf8").digest("hex");
    const result = verifyVendorWebhookSignature(body, headers({ "elevenlabs-signature": legacy }), WEBHOOK_SECRET);
    expect(result).toMatchObject({ verified: false, failure: "bad_signature" });
  });
});
