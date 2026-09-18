/**
 * src/modules/voice-core/webhook-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticity verification for the two signed inbound paths of the
 * ElevenLabs integration (plan §11.3):
 *
 *   1. INTERNAL server-tool callback — the Mode-B RAG bridge
 *      POST /api/internal/elevenlabs/tools/rag-search
 *      Verified with: HMAC-SHA256 (ELEVENLABS_TOOL_HMAC_SECRET) over the
 *      raw body + timestamp header (±5 min window) + single-use nonce
 *      (elevenlabs_webhook_nonces ledger, replay guard).
 *
 *   2. VENDOR post-call webhook — transcript/analytics delivery
 *      POST /api/webhooks/elevenlabs/post-call
 *      Verified with the vendor's signature scheme: HMAC-SHA256
 *      (ELEVENLABS_WEBHOOK_SECRET) over the raw body, delivered in the
 *      `elevenlabs-signature` header. Single-use nonce guard optional —
 *      the vendor does not send one, so replay protection relies on the
 *      upsert semantics (same conversation_id → same record).
 *
 * Secrets are SERVER-ONLY and scrubbed from logs (src/lib/redact.ts).
 * Verification is constant-time where it matters (crypto.timingSafeEqual).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { execute, query as dbQuery } from "@/lib/db";
import { getToolHmacSecret } from "./model-catalog";

/** Allowed clock skew for internal tool callbacks (plan §11.3: ±5 min). */
export const TOOL_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/** Nonce rows older than this are swept (double the timestamp window). */
const NONCE_TTL_MS = TOOL_TIMESTAMP_WINDOW_MS * 2;

export type WebhookAuthFailure =
  | "missing_secret"
  | "missing_signature"
  | "bad_signature"
  | "stale_timestamp"
  | "replayed_nonce";

export interface WebhookAuthResult {
  verified: boolean;
  failure?: WebhookAuthFailure;
}

// ─── Primitive: constant-time hex digest comparison ──────────────────────────

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

// ─── Internal tool-callback verification ─────────────────────────────────────

/**
 * Verifies an internal Mode-B tool callback.
 *
 * Expected headers (sent by the vendor agent's webhook tool config):
 *   x-clara-signature : hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 *   x-clara-timestamp : unix milliseconds
 *   x-clara-nonce     : single-use random string (uuid or equivalent)
 *
 * The HMAC covers timestamp + body, so a captured signature cannot be
 * replayed with a different payload, and the timestamp bounds replay to
 * the ±5 min window; the nonce closes that window entirely.
 */
export async function verifyInternalToolCall(
  rawBody: string,
  headers: Headers,
): Promise<WebhookAuthResult> {
  const secret = getToolHmacSecret();
  if (!secret) return { verified: false, failure: "missing_secret" };

  const signature = headers.get("x-clara-signature")?.trim();
  if (!signature) return { verified: false, failure: "missing_signature" };

  const timestamp = headers.get("x-clara-timestamp")?.trim();
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    return { verified: false, failure: "stale_timestamp" };
  }

  const timestampMs = Number(timestamp);
  const drift = Math.abs(Date.now() - timestampMs);
  if (drift > TOOL_TIMESTAMP_WINDOW_MS) {
    return { verified: false, failure: "stale_timestamp" };
  }

  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!safeEqualHex(expected, signature.toLowerCase())) {
    return { verified: false, failure: "bad_signature" };
  }

  const nonce = headers.get("x-clara-nonce")?.trim();
  if (!nonce || nonce.length < 8 || nonce.length > 128) {
    // Unsigned-replay protection requires a nonce — treat malformed ones
    // as a bad signature rather than skipping the guard.
    return { verified: false, failure: "bad_signature" };
  }

  const fresh = await consumeNonce(nonce, "tool");
  if (!fresh) return { verified: false, failure: "replayed_nonce" };

  return { verified: true };
}

/** Composes the signature an authorised caller would send (tests + e2e). */
export function signInternalToolCall(
  secret: string,
  rawBody: string,
  timestampMs: number,
): string {
  return hmacSha256Hex(secret, `${timestampMs}.${rawBody}`);
}

// ─── Vendor post-call webhook verification ───────────────────────────────────

/**
 * Verifies an ElevenLabs post-call webhook signature: the vendor sends
 * `elevenlabs-signature` — hex HMAC-SHA256(webhook secret, raw body).
 */
export function verifyVendorWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
): WebhookAuthResult {
  if (!secret) return { verified: false, failure: "missing_secret" };

  const signature = headers.get("elevenlabs-signature")?.trim();
  if (!signature) return { verified: false, failure: "missing_signature" };

  const expected = hmacSha256Hex(secret, rawBody);
  if (!safeEqualHex(expected, signature.toLowerCase())) {
    return { verified: false, failure: "bad_signature" };
  }
  return { verified: true };
}

// ─── Nonce ledger (replay guard) ─────────────────────────────────────────────

/**
 * Atomically consumes a nonce. Returns false when the nonce was already
 * used (replay) — the unique PK insert is the race-free arbiter.
 */
export async function consumeNonce(nonce: string, kind: "tool" | "post-call"): Promise<boolean> {
  try {
    const rows = await dbQuery<{ inserted: boolean }>(
      `INSERT INTO elevenlabs_webhook_nonces (nonce, kind)
       VALUES ($1, $2)
       ON CONFLICT (nonce) DO NOTHING
       RETURNING TRUE AS inserted`,
      [nonce, kind],
    );
    return rows.length > 0;
  } catch (err) {
    // Fail CLOSED on nonce-ledger errors: an unverifiable replay state must
    // not degrade into "assume fresh" (plan §11.3 discipline).
    console.warn("[voice-core] nonce ledger error:", (err as Error).message);
    return false;
  }
}

/**
 * Best-effort sweep of expired nonce rows. Called opportunistically from
 * the webhook handlers; failure is harmless (rows only guard a ±5 min
 * window anyway).
 */
export async function sweepExpiredNonces(): Promise<void> {
  try {
    await execute(
      `DELETE FROM elevenlabs_webhook_nonces WHERE created_at < now() - ($1 || ' milliseconds')::interval`,
      [String(NONCE_TTL_MS)],
    );
  } catch {
    // cosmetic — the TTL sweep is an optimisation, not a guarantee
  }
}
