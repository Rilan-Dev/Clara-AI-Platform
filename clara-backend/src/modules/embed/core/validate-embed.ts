/**
 * src/modules/embed/core/validate-embed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware utility for public embed API endpoints.
 *
 * Every public endpoint (/api/embed/...) must call validateEmbedRequest()
 * at the top. It handles:
 *   1. Extract the raw API key from Authorization: Bearer <key> header
 *   2. Validate the key exists, is active, and belongs to an active KB
 *   3. Validate the request Origin against allowed_origins (if configured)
 *   4. Check + increment the rate limit for the current hour
 *
 * Returns:
 *   { ok: true, ctx: ValidatedKey }   — proceed with the request
 *   { ok: false, response: NextResponse } — return this error response immediately
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateApiKey,
  checkAndIncrementRateLimit,
  type ValidatedKey,
} from "./api-keys-db";

export type EmbedContext = ValidatedKey;

type ValidationResult =
  | { ok: true;  ctx: EmbedContext }
  | { ok: false; response: NextResponse };

/**
 * CORS headers to attach to every embed response so the browser doesn't block them.
 * The actual origin is validated below — we only echo it back when it's allowed.
 */
export function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const allowOrigin = resolveAllowedOrigin(origin, allowedOrigins);
  return {
    "Access-Control-Allow-Origin":  allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  };
}

function resolveAllowedOrigin(origin: string | null, allowedOrigins: string[]): string {
  // No restriction configured → allow any origin
  if (!allowedOrigins || allowedOrigins.length === 0) return origin ?? "*";

  if (!origin) return "null";

  // Normalize: strip trailing slash, lowercase
  const normalizedOrigin = origin.replace(/\/$/, "").toLowerCase();

  for (const allowed of allowedOrigins) {
    const normalizedAllowed = allowed.replace(/\/$/, "").toLowerCase();
    // Wildcard subdomain: "*.example.com"
    if (normalizedAllowed.startsWith("*.")) {
      const suffix = normalizedAllowed.slice(1); // ".example.com"
      if (normalizedOrigin.endsWith(suffix)) return origin;
    } else if (normalizedOrigin === normalizedAllowed) {
      return origin;
    }
  }

  return "null"; // blocked
}

function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) return true; // open
  if (!origin) return false;
  return resolveAllowedOrigin(origin, allowedOrigins) !== "null";
}

export async function validateEmbedRequest(req: NextRequest): Promise<ValidationResult> {
  // ── 1. Extract API key ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!rawKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing API key. Set Authorization: Bearer <your-key>" },
        { status: 401 }
      ),
    };
  }

  // ── 2. Validate key + KB status ────────────────────────────────────────────
  const ctx = await validateApiKey(rawKey);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or revoked API key" },
        { status: 401 }
      ),
    };
  }

  // ── 3. Validate Origin ────────────────────────────────────────────────────
  const origin = req.headers.get("origin");
  if (!isOriginAllowed(origin, ctx.allowedOrigins)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Origin "${origin}" is not allowed for this API key` },
        { status: 403 }
      ),
    };
  }

  // ── 4. Rate limit ──────────────────────────────────────────────────────────
  const withinLimit = await checkAndIncrementRateLimit(ctx.keyId, ctx.rateLimitPerHour);
  if (!withinLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Rate limit exceeded",
          retryAfter: "Try again next hour",
          limit: ctx.rateLimitPerHour,
        },
        {
          status: 429,
          headers: { "Retry-After": "3600" },
        }
      ),
    };
  }

  return { ok: true, ctx };
}

/** Handle preflight OPTIONS requests for embed endpoints */
export function handlePreflight(req: NextRequest, allowedOrigins: string[] = []): NextResponse {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin, allowedOrigins),
  });
}
