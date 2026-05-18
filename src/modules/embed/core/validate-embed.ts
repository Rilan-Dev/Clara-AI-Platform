/**
 * src/modules/embed/core/validate-embed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware utility for every public embed endpoint (/api/embed/...).
 *
 * validateEmbedRequest() pipeline (in order):
 *   1. Extract Bearer token
 *   2. Validate key — exists, active, KB active
 *   3. Origin check — allowed_origins list
 *   4. Fetch org plan limits (max_req_day, voice_enabled)  ← Phase 3
 *   5. Daily quota check (org-wide rolling 24 h)           ← Phase 3
 *   6. Hourly per-key rate limit (increment + check)
 *
 * On success returns { ok: true, ctx: EmbedContext } where ctx now carries
 * planLimits so downstream routes (e.g. session) don't need another DB round-trip.
 *
 * Phase 3 also exports:
 *   - requireVoiceAccess() — standalone gate for /api/embed/session
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateApiKey,
  checkAndIncrementRateLimit,
  getOrgPlanForKey,
  checkDailyQuota,
  type ValidatedKey,
  type OrgPlanLimits,
} from "./api-keys-db";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Full context available to every embed route handler after validation. */
export type EmbedContext = ValidatedKey & {
  /**
   * Subscription plan limits fetched during validation.
   * Null only when the org has no active subscription (should be caught by
   * the daily-quota check first, but typed defensively).
   */
  planLimits: OrgPlanLimits | null;
};

type ValidationResult =
  | { ok: true;  ctx: EmbedContext }
  | { ok: false; response: NextResponse };

// ── Localhost regex (used by both CORS helpers and origin validator) ─────────

/** Matches any localhost / 127.0.0.1 origin regardless of port. */
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// ── CORS helpers ──────────────────────────────────────────────────────────────

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
  selfOrigin?: string | null,
): Record<string, string> {
  const allowOrigin = resolveAllowedOrigin(origin, allowedOrigins, selfOrigin);
  return {
    "Access-Control-Allow-Origin":      allowOrigin,
    "Access-Control-Allow-Methods":     "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization, Accept, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age":           "86400",
    "Vary":                             "Origin",
  };
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "").toLowerCase();
}

function resolveAllowedOrigin(origin: string | null, allowedOrigins: string[], selfOrigin?: string | null): string {
  if (!allowedOrigins || allowedOrigins.length === 0) return origin ?? "*";
  if (!origin) return "null";

  // Localhost is always implicitly allowed — echo the origin so the browser
  // accepts the response even if the DB list only has the production domain.
  if (LOCALHOST_RE.test(origin)) return origin;

  const normalizedOrigin = normalizeOrigin(origin);

  if (selfOrigin && normalizedOrigin === normalizeOrigin(selfOrigin)) return origin;

  for (const allowed of allowedOrigins) {
    const normalizedAllowed = normalizeOrigin(allowed);
    if (normalizedAllowed.startsWith("*.")) {
      if (normalizedOrigin.endsWith(normalizedAllowed.slice(1))) return origin;
    } else if (normalizedOrigin === normalizedAllowed) {
      return origin;
    }
  }

  return "null";
}

function isOriginAllowed(origin: string | null, allowedOrigins: string[], selfOrigin?: string | null): boolean {
  // Empty list → unrestricted (key created without an origin whitelist)
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  // No Origin header → server-to-server / curl / Postman — always allow
  if (!origin) return true;
  // Localhost is always allowed for developer convenience
  if (LOCALHOST_RE.test(origin)) return true;
  if (selfOrigin && normalizeOrigin(origin) === normalizeOrigin(selfOrigin)) return true;
  // Normalise http↔https: if the DB has http://example.com, also accept https://example.com
  // and vice versa. This prevents breakage when a site upgrades to HTTPS but the stored
  // origin still has the http:// variant.
  const normalised = [
    origin,
    origin.startsWith("https://") ? origin.replace("https://", "http://") : origin.replace("http://", "https://"),
  ];
  return normalised.some(o => resolveAllowedOrigin(o, allowedOrigins, selfOrigin) !== "null");
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateEmbedRequest(req: NextRequest): Promise<ValidationResult> {

  // ── 1. Extract Bearer token ─────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey     = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  // ── DEMO BYPASS ─────────────────────────────────────────────────────────────
  // If the request uses the special DEMO_MODE token, bypass DB checks and 
  // return a mock context linked to the first seeded Knowledge Base (omenKb1).
  // This allows the landing page demo to work securely without real auth.
  if (rawKey === "DEMO_MODE") {
    return {
      ok: true,
      ctx: {
        keyId: "demo-key",
        kbId: "30000000-0000-0000-0000-000000000001", // omenKb1
        orgId: "10000000-0000-0000-0000-000000000001",
        kbName: "Demo Insurance Knowledge Base",
        kbDescription: "Demo KB",
        kbPersona: "You are Aria, an AI assistant for Omen United Insurance. Answer questions about insurance policies using only information from the knowledge base. Always cite your sources with [S1], [S2] notation. Be accurate, professional, and helpful.",
        rateLimitPerHour: 1000,
        allowedOrigins: ["*"],
        designEditEnabled: false,
        planLimits: {
          orgId: "10000000-0000-0000-0000-000000000001",
          planId: "pro",
          planName: "Pro Plan",
          maxReqDay: 10000,
          voiceEnabled: true,
          apiAccess: true,
        }
      }
    };
  }

  if (!rawKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing API key. Set Authorization: Bearer <your-key>" },
        { status: 401 }
      ),
    };
  }

  // ── 2. Validate key + KB active ─────────────────────────────────────────────
  const keyCtx = await validateApiKey(rawKey);
  if (!keyCtx) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or revoked API key" },
        { status: 401 }
      ),
    };
  }

  // ── 3. Origin check ─────────────────────────────────────────────────────────
  const origin = req.headers.get("origin");
  const selfOrigin = req.nextUrl.origin;
  if (!isOriginAllowed(origin, keyCtx.allowedOrigins, selfOrigin)) {
    // Include CORS headers even on rejection so the browser can read the error
    // message in the console instead of showing a blank "CORS error".
    // This matches the standard approach used by Stripe, Pusher, etc.
    const rejectCorsHeaders = buildCorsHeaders(origin, [], selfOrigin);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Origin "${origin}" is not in the allowed origins for this API key.`,
          hint:  `Add "${origin}" to the key's allowed origins in the Deploy tab of your knowledge base.`,
          allowedOrigins: keyCtx.allowedOrigins,
        },
        { status: 403, headers: rejectCorsHeaders }
      ),
    };
  }

  // ── 4. Fetch plan limits ────────────────────────────────────────────────────
  // Runs concurrently with step 5 where possible.
  const planLimits = await getOrgPlanForKey(keyCtx.keyId);

  // ── 5. Daily quota (org-wide rolling 24 h) ──────────────────────────────────
  if (planLimits) {
    const quota = await checkDailyQuota(keyCtx.orgId, planLimits.maxReqDay);

    if (!quota.allowed) {
      const isHardLimit = planLimits.maxReqDay === 0; // plan has no daily access at all
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: isHardLimit
              ? "Your plan does not include API request access. Please upgrade."
              : `Daily request quota exceeded (${quota.current.toLocaleString()} / ${quota.limit.toLocaleString()} requests). Resets in ${hoursUntilMidnightUTC()} h.`,
            code:    "DAILY_QUOTA_EXCEEDED",
            current: quota.current,
            limit:   quota.limit,
            plan:    planLimits.planId,
          },
          {
            status: 429,
            headers: { "Retry-After": String(secondsUntilMidnightUTC()) },
          }
        ),
      };
    }
  }

  // ── 6. Hourly per-key rate limit (increments counter) ──────────────────────
  const withinHourlyLimit = await checkAndIncrementRateLimit(
    keyCtx.keyId,
    keyCtx.rateLimitPerHour
  );

  if (!withinHourlyLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:      "Hourly rate limit exceeded. Try again next hour.",
          code:       "RATE_LIMIT_EXCEEDED",
          limit:      keyCtx.rateLimitPerHour,
          retryAfter: "Try again next hour",
        },
        {
          status: 429,
          headers: { "Retry-After": "3600" },
        }
      ),
    };
  }

  // ── All checks passed ───────────────────────────────────────────────────────
  return {
    ok: true,
    ctx: { ...keyCtx, planLimits },
  };
}

// ── Voice access gate (Phase 3) ───────────────────────────────────────────────

/**
 * Call this at the top of /api/embed/session after validateEmbedRequest.
 * Returns a 403 response if the org's plan does not include voice, or null
 * if voice is allowed (proceed normally).
 */
export function requireVoiceAccess(
  ctx: EmbedContext,
  corsHeaders: Record<string, string>
): NextResponse | null {
  // No subscription plan found → allow voice (self-hosted / trial / no billing configured).
  // Voice is blocked only when there is an explicit plan that disables it.
  if (!ctx.planLimits) return null;

  if (!ctx.planLimits.voiceEnabled) {
    return NextResponse.json(
      {
        error: `Voice assistant is not included in the ${ctx.planLimits.planName} plan. Upgrade to Pro or above.`,
        code:  "VOICE_NOT_ENABLED",
        plan:  ctx.planLimits.planId,
      },
      { status: 403, headers: corsHeaders }
    );
  }

  return null; // access granted
}

// ── Preflight handler ─────────────────────────────────────────────────────────

export function handlePreflight(req: NextRequest, allowedOrigins: string[] = []): NextResponse {
  const origin = req.headers.get("origin");
  // For preflight, always echo the origin back (embed endpoints are public-key-authenticated,
  // not restricted by origin at the OPTIONS level — the actual GET/POST validates origin).
  const headers = buildCorsHeaders(origin, allowedOrigins, req.nextUrl.origin);
  // Override: always allow the requesting origin on OPTIONS so the preflight succeeds
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new NextResponse(null, { status: 204, headers });
}

// ── Design-API validator ──────────────────────────────────────────────────────
//
// Same full pipeline as validateEmbedRequest PLUS an additional gate:
// the key must have design_edit_enabled = TRUE.
// This is called exclusively by PATCH /api/embed/design.

export async function validateEmbedDesignRequest(req: NextRequest): Promise<ValidationResult> {
  // Reuse the full standard pipeline first
  const base = await validateEmbedRequest(req);
  if (!base.ok) return base;

  const { ctx } = base;
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);

  // Gate: design editing must be explicitly enabled on this key by the admin
  if (!ctx.designEditEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:  "This API key does not have design-edit permission.",
          hint:   "Go to the Deploy tab in your knowledge base, click Edit on this key, and enable 'Allow widget design editing'.",
          code:   "DESIGN_EDIT_DISABLED",
        },
        { status: 403, headers: corsHeaders }
      ),
    };
  }

  return base;
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function hoursUntilMidnightUTC(): number {
  const now        = new Date();
  const midnight   = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000);
}

function secondsUntilMidnightUTC(): number {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1_000);
}
