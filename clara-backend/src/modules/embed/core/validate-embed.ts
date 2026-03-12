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

// ── CORS helpers ──────────────────────────────────────────────────────────────

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[]
): Record<string, string> {
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
  if (!allowedOrigins || allowedOrigins.length === 0) return origin ?? "*";
  if (!origin) return "null";

  const normalizedOrigin = origin.replace(/\/$/, "").toLowerCase();

  for (const allowed of allowedOrigins) {
    const normalizedAllowed = allowed.replace(/\/$/, "").toLowerCase();
    if (normalizedAllowed.startsWith("*.")) {
      if (normalizedOrigin.endsWith(normalizedAllowed.slice(1))) return origin;
    } else if (normalizedOrigin === normalizedAllowed) {
      return origin;
    }
  }

  return "null";
}

function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  if (!origin) return false;
  return resolveAllowedOrigin(origin, allowedOrigins) !== "null";
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateEmbedRequest(req: NextRequest): Promise<ValidationResult> {

  // ── 1. Extract Bearer token ─────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey     = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

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
  if (!isOriginAllowed(origin, keyCtx.allowedOrigins)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Origin "${origin}" is not allowed for this API key` },
        { status: 403 }
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
  if (!ctx.planLimits) {
    // No plan found — deny by default
    return NextResponse.json(
      { error: "Voice access requires an active subscription. Please check your billing." },
      { status: 403, headers: corsHeaders }
    );
  }

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
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin, allowedOrigins),
  });
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
