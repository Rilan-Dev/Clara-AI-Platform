/**
 * src/modules/voice-core/webhook-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticity verification for the two signed inbound paths of the
 * ElevenLabs integration (plan §11.3, modernised 2026-09):
 *
 *   1. INTERNAL server-tool callback — the Mode-B RAG bridge
 *      POST /api/internal/elevenlabs/tools/rag-search
 *      Verified with a STATIC SHARED TOKEN: the vendor's webhook tools
 *      cannot compute per-request HMAC signatures, so the tool config
 *      sends x-clara-tool-token (constant header, ELEVENLABS_TOOL_HMAC_SECRET)
 *      alongside the tenant ids (x-clara-org-id / -kb-id / -agent-id).
 *      Comparison is constant-time; the real tenant boundary is the
 *      elevenlabs_agents binding re-validation in webhooks.ts — a stolen
 *      tool config still cannot read another tenant's KB.
 *
 *   2. VENDOR post-call webhook — transcript/analytics delivery
 *      POST /api/webhooks/elevenlabs/post-call
 *      Verified with the vendor's Stripe-style scheme: the
 *      `elevenlabs-signature` header carries `t={unix_s},v1={hex HMAC}`
 *      where the HMAC is SHA-256 of `{t}.{rawBody}` keyed with the
 *      workspace webhook secret (ELEVENLABS_WEBHOOK_SECRET). Timestamp
 *      tolerance bounds replay; a legacy plain-HMAC-over-body header is
 *      still accepted for older vendor deliveries.
 *
 * Secrets are SERVER-ONLY and scrubbed from logs (src/lib/redact.ts).
 * Verification is constant-time where it matters (crypto.timingSafeEqual).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { execute, query as dbQuery } from "@/lib/db";
import { getToolHmacSecret } from "./model-catalog";

/** Allowed clock skew for vendor post-call signatures (Stripe-style t= guard). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 10 * 60 * 1000;

/** Nonce rows older than this are swept (kept for ledger hygiene). */
const NONCE_TTL_MS = WEBHOOK_TIMESTAMP_TOLERANCE_MS * 2;

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
 * Expected headers (constant headers baked into the vendor tool config by
 * ElevenLabsVoiceProvider.createConversationalAgent):
 *   x-clara-tool-token : the shared static secret
 *
 * The tenant-id headers (x-clara-org-id / -kb-id / -agent-id) are read by
 * the route handler and re-validated against the elevenlabs_agents binding
 * THERE — this function only proves "the caller knows the shared secret".
 */
export async function verifyInternalToolCall(
  rawBody: string,
  headers: Headers,
): Promise<WebhookAuthResult> {
  void rawBody; // the static-token scheme is body-independent
  const secret = getToolHmacSecret();
  if (!secret) return { verified: false, failure: "missing_secret" };

  const token = headers.get("x-clara-tool-token")?.trim();
  if (!token) return { verified: false, failure: "missing_signature" };

  if (!safeEqualHex(token, secret)) {
    return { verified: false, failure: "bad_signature" };
  }

  return { verified: true };
}

/**
 * Composes the token an authorised caller would send (tests + e2e).
 */
export function signInternalToolCall(
  secret: string,
): string {
  return secret;
}

// ─── Vendor post-call webhook verification ───────────────────────────────────

/**
 * Verifies an ElevenLabs post-call webhook signature.
 *
 * Current scheme (Stripe-style, delivered in `elevenlabs-signature`):
 *   t={unix_seconds},v1={hex HMAC-SHA256(secret, `${t}.${rawBody}`)}
 * — possibly with several v1= entries (secret rotation); any match passes.
 * A legacy plain `hex HMAC-SHA256(secret, rawBody)` header is still
 * accepted so deliveries signed by older vendor infrastructure land.
 */
export function verifyVendorWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
): WebhookAuthResult {
  if (!secret) return { verified: false, failure: "missing_secret" };

  const signature = headers.get("elevenlabs-signature")?.trim();
  if (!signature) return { verified: false, failure: "missing_signature" };

  // ── Stripe-style: t=…,v1=… ────────────────────────────────────────────
  const parts = splitSignatureHeader(signature);
  if (parts.timestamp != null) {
    const drift = Math.abs(Date.now() / 1000 - parts.timestamp);
    if (drift > WEBHOOK_TIMESTAMP_TOLERANCE_MS / 1000) {
      return { verified: false, failure: "stale_timestamp" };
    }
    const signedPayload = `${parts.timestamp}.${rawBody}`;
    for (const candidate of parts.signatures) {
      if (safeEqualHex(hmacSha256Hex(secret, signedPayload), candidate.toLowerCase())) {
        return { verified: true };
      }
    }
    return { verified: false, failure: "bad_signature" };
  }

  // ── Legacy: plain hex HMAC over the raw body ──────────────────────────
  const expected = hmacSha256Hex(secret, rawBody);
  if (!safeEqualHex(expected, signature.toLowerCase())) {
    return { verified: false, failure: "bad_signature" };
  }
  return { verified: true };
}

/** Parses `t=123,v1=abc,v1=def` — returns null timestamp for legacy headers. */
function splitSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  const signatures: string[] = [];
  let timestamp: number | null = null;
  for (const part of header.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=").trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value.length > 0) signatures.push(value);
  }
  return { timestamp, signatures };
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
