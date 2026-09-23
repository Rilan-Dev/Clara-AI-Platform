/**
 * Shared validation middleware for public embed endpoints.
 *
 * Origin policy:
 *   - empty allowedOrigins: unrestricted
 *   - "*": unrestricted
 *   - exact origin: restricted to that origin
 *   - "*.example.com": restricted to matching subdomains
 *
 * For wildcard CORS we echo the requesting Origin because credentials are
 * enabled; browsers do not allow Access-Control-Allow-Origin: * together
 * with Access-Control-Allow-Credentials: true.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateApiKey,
  checkAndIncrementRateLimit,
  getOrgPlanForKey,
  getOrgPlanForOrg,
  checkDailyQuota,
  type ValidatedKey,
  type OrgPlanLimits,
} from "./api-keys-db";
import {
  isPublicSessionToken,
  verifyPublicSessionToken,
} from "./public-token";
import { getActiveDeploymentCached } from "@/modules/agent-versioning/core/db";

export type EmbedContext = ValidatedKey & {
  planLimits: OrgPlanLimits | null;
};

type ValidationResult =
  | { ok: true; ctx: EmbedContext }
  | { ok: false; response: NextResponse };

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "").toLowerCase();
}

/** True when the configured list means that every origin is allowed. */
function isWildcardOriginPolicy(allowedOrigins: string[] | null | undefined): boolean {
  return !allowedOrigins || allowedOrigins.length === 0 || allowedOrigins.some(
    (allowed) => normalizeOrigin(allowed.trim()) === "*",
  );
}

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
  selfOrigin?: string | null,
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(origin, allowedOrigins, selfOrigin),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function resolveAllowedOrigin(
  origin: string | null,
  allowedOrigins: string[],
  selfOrigin?: string | null,
): string {
  // Empty list and explicit "*" both mean unrestricted. Since this API uses
  // credentials, echo the caller's origin instead of returning literal "*".
  if (isWildcardOriginPolicy(allowedOrigins)) return origin ?? "*";
  if (!origin) return "null";

  if (LOCALHOST_RE.test(origin)) return origin;

  const normalizedOrigin = normalizeOrigin(origin);
  if (selfOrigin && normalizedOrigin === normalizeOrigin(selfOrigin)) return origin;

  for (const allowed of allowedOrigins) {
    const normalizedAllowed = normalizeOrigin(allowed.trim());

    if (normalizedAllowed.startsWith("*.")) {
      // *.example.com matches sub.example.com and deeper subdomains, but not
      // the bare example.com itself.
      if (normalizedOrigin.endsWith(normalizedAllowed.slice(1))) return origin;
    } else if (normalizedOrigin === normalizedAllowed) {
      return origin;
    }
  }

  return "null";
}

function isOriginAllowed(
  origin: string | null,
  allowedOrigins: string[],
  selfOrigin?: string | null,
): boolean {
  return isOriginAllowedForEmbed(origin, allowedOrigins, selfOrigin);
}

/**
 * Canonical embed origin policy — shared by every embed-authenticated surface
 * (validateEmbedRequest for the /api/embed/* routes AND the voice-core Mode A
 * pipeline guard in embed-auth.ts). Semantics:
 *   • empty / missing list, or "*" entry  → unrestricted
 *   • no Origin header (non-browser)      → allowed
 *   • localhost / 127.0.0.1               → allowed (dev surfaces)
 *   • origin === selfOrigin               → allowed (same-host embeds, e.g.
 *     the platform's own /embed/voice page served from the same domain)
 *   • exact match or "*.example.com" subdomain match on the key's list
 *   • http ⇄ https alternate-protocol match
 */
export function isOriginAllowedForEmbed(
  origin: string | null,
  allowedOrigins: string[],
  selfOrigin?: string | null,
): boolean {
  // Explicitly configured wildcard is unrestricted.
  if (isWildcardOriginPolicy(allowedOrigins)) return true;

  // Requests without an Origin header are not browser CORS requests.
  if (!origin) return true;

  if (LOCALHOST_RE.test(origin)) return true;
  if (selfOrigin && normalizeOrigin(origin) === normalizeOrigin(selfOrigin)) return true;

  const alternateProtocolOrigin = origin.startsWith("https://")
    ? origin.replace("https://", "http://")
    : origin.replace("http://", "https://");

  return [origin, alternateProtocolOrigin].some(
    (candidate) => resolveAllowedOrigin(candidate, allowedOrigins, selfOrigin) !== "null",
  );
}

/** Hourly request ceiling for public-session-token traffic (per agent). */
const PUBLIC_TOKEN_RATE_LIMIT_PER_HOUR = 500;

/**
 * Validate a public session token (pub_…) bearer credential — the public
 * PUBLISHED agent page's short-lived, HMAC-signed, deployment-bound token.
 *
 * Every use re-verifies the ACTIVE deployment and its publicAccess flag, so
 * unpublishing or flipping the agent private cuts off existing tokens
 * immediately. Plan entitlement is resolved from the ORG (no api_keys row
 * exists for public tokens) and applies the same daily-quota gate as keyed
 * embeds.
 */
async function validatePublicTokenRequest(
  rawToken: string,
): Promise<{ ctx: ValidatedKey } | { error: NextResponse }> {
  const verified = verifyPublicSessionToken(rawToken);
  if (!verified) {
    return {
      error: NextResponse.json(
        { error: "This public session has expired. Reload the page to continue." },
        { status: 401 },
      ),
    };
  }

  const { payload } = verified;
  const deployment = await getActiveDeploymentCached(payload.a);
  if (
    !deployment ||
    !deployment.publicAccess ||
    deployment.id !== payload.d
  ) {
    return {
      error: NextResponse.json(
        { error: "This assistant is no longer publicly available." },
        { status: 403 },
      ),
    };
  }

  return {
    ctx: {
      keyId: `public:${payload.a}`,
      kbId: payload.k,
      orgId: payload.o,
      // The public page is same-origin; embed CORS policy stays unrestricted
      // (the canonical policy allows no-origin/non-browser and same-host).
      allowedOrigins: ["*"],
      rateLimitPerHour: PUBLIC_TOKEN_RATE_LIMIT_PER_HOUR,
      designEditEnabled: false,
    },
  };
}

export async function validateEmbedRequest(req: NextRequest): Promise<ValidationResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  // // DEMO_MODE bypass.
  // if (rawKey === "DEMO_MODE") {
  //   const demo = await getDemoSettings();

  //   if (!demo.enabled) {
  //     return {
  //       ok: false,
  //       response: NextResponse.json(
  //         { error: "Demo mode is currently disabled by the platform administrator." },
  //         { status: 403 },
  //       ),
  //     };
  //   }

  //   return {
  //     ok: true,
  //     ctx: {
  //       keyId: "demo-key",
  //       kbId: demo.kbId,
  //       orgId: demo.orgId,
  //       rateLimitPerHour: demo.rateLimitPerHour,
  //       allowedOrigins: ["*"],
  //       designEditEnabled: false,
  //       planLimits: {
  //         planId: "pro",
  //         planName: "Pro Plan",
  //         maxReqDay: demo.maxRequestsPerDay,
  //         voiceEnabled: demo.voiceEnabled,
  //       },
  //     },
  //   };
  // }

  if (!rawKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing API key. Set Authorization: Bearer <your-key>" },
        { status: 401 },
      ),
    };
  }

  // Public session tokens (pub_…) — the public published agent page's
  // short-lived signed credential. Validated like an embed key but bound to
  // the agent's active PUBLIC deployment, with the org's plan governing
  // quota/voice entitlement (no api_keys row exists to look up).
  const isPublicToken = isPublicSessionToken(rawKey);

  let keyCtx: ValidatedKey | null;
  if (isPublicToken) {
    const publicResult = await validatePublicTokenRequest(rawKey);
    if ("error" in publicResult) {
      return { ok: false, response: publicResult.error };
    }
    keyCtx = publicResult.ctx;
  } else {
    keyCtx = await validateApiKey(rawKey);
  }
  if (!keyCtx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 }),
    };
  }

  const origin = req.headers.get("origin");
  const selfOrigin = req.nextUrl.origin;

  if (!isOriginAllowed(origin, keyCtx.allowedOrigins, selfOrigin)) {
    const rejectCorsHeaders = buildCorsHeaders(origin, [], selfOrigin);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Origin "${origin}" is not in the allowed origins for this API key.`,
          hint: `Add "${origin}" to the key's allowed origins in the Deploy tab of your knowledge base, or use * to allow all origins.`,
          allowedOrigins: keyCtx.allowedOrigins,
        },
        { status: 403, headers: rejectCorsHeaders },
      ),
    };
  }

  // These guards use independent database operations. Fetch the plan and
  // reserve the hourly counter together so the public embed hot path does not
  // pay two sequential database round trips.
  const [planLimits, withinHourlyLimit] = await Promise.all([
    isPublicToken ? getOrgPlanForOrg(keyCtx.orgId) : getOrgPlanForKey(keyCtx.keyId),
    checkAndIncrementRateLimit(keyCtx.keyId, keyCtx.rateLimitPerHour),
  ]);

  if (planLimits) {
    const quota = await checkDailyQuota(keyCtx.orgId, planLimits.maxReqDay);

    if (!quota.allowed) {
      const isHardLimit = planLimits.maxReqDay === 0;
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: isHardLimit
              ? "Your plan does not include API request access. Please upgrade."
              : `Daily request quota exceeded (${quota.current.toLocaleString()} / ${quota.limit.toLocaleString()} requests). Resets in ${hoursUntilMidnightUTC()} h.`,
            code: "DAILY_QUOTA_EXCEEDED",
            current: quota.current,
            limit: quota.limit,
            plan: planLimits.planId,
          },
          { status: 429, headers: { "Retry-After": String(secondsUntilMidnightUTC()) } },
        ),
      };
    }
  }


  if (!withinHourlyLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Hourly rate limit exceeded. Try again next hour.",
          code: "RATE_LIMIT_EXCEEDED",
          limit: keyCtx.rateLimitPerHour,
          retryAfter: "Try again next hour",
        },
        { status: 429, headers: { "Retry-After": "3600" } },
      ),
    };
  }

  return { ok: true, ctx: { ...keyCtx, planLimits } };
}

export function requireVoiceAccess(
  ctx: EmbedContext,
  corsHeaders: Record<string, string>,
): NextResponse | null {
  if (!ctx.planLimits) return null;

  if (!ctx.planLimits.voiceEnabled) {
    return NextResponse.json(
      {
        error: `Voice assistant is not included in the ${ctx.planLimits.planName} plan. Upgrade to Pro or above.`,
        code: "VOICE_NOT_ENABLED",
        plan: ctx.planLimits.planId,
      },
      { status: 403, headers: corsHeaders },
    );
  }

  return null;
}

export function handlePreflight(
  req: NextRequest,
  allowedOrigins: string[] = [],
): NextResponse {
  const origin = req.headers.get("origin");
  const headers = buildCorsHeaders(origin, allowedOrigins, req.nextUrl.origin);

  // For public-key embed endpoints, OPTIONS itself does not authenticate the
  // API key. Echoing the requesting origin allows the browser to complete the
  // preflight; the actual request is still checked by validateEmbedRequest().
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  return new NextResponse(null, { status: 204, headers });
}

export async function validateEmbedDesignRequest(req: NextRequest): Promise<ValidationResult> {
  const base = await validateEmbedRequest(req);
  if (!base.ok) return base;

  const { ctx } = base;
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);

  if (!ctx.designEditEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "This API key does not have design-edit permission.",
          hint: "Go to the Deploy tab in your knowledge base, click Edit on this key, and enable 'Allow widget design editing'.",
          code: "DESIGN_EDIT_DISABLED",
        },
        { status: 403, headers: corsHeaders },
      ),
    };
  }

  return base;
}

function hoursUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000);
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1_000);
}

// type DemoSettings = {
//   enabled: boolean;
//   voiceEnabled: boolean;
//   chatEnabled: boolean;
//   kbId: string;
//   kbName: string;
//   kbPersona: string;
//   orgId: string;
//   voiceGreeting: string;
//   rateLimitPerHour: number;
//   maxRequestsPerDay: number;
// };

// let _demoCache: { data: DemoSettings; ts: number } | null = null;
// const DEMO_CACHE_TTL = 60_000;

// function demoVal(
//   settings: Array<{ key: string; value: string }>,
//   key: string,
//   fallback: string,
// ): string {
//   return settings.find((s) => s.key === key)?.value || fallback;
// }

// async function getDemoSettings(): Promise<DemoSettings> {
//   const now = Date.now();
//   if (_demoCache && now - _demoCache.ts < DEMO_CACHE_TTL) return _demoCache.data;

//   try {
//     const all = await getPlatformEnvSettings();
//     const demo = all.filter((s) => s.key.startsWith("DEMO_"));

//     const data: DemoSettings = {
//       enabled: demoVal(demo, "DEMO_ENABLED", "true") === "true",
//       voiceEnabled: demoVal(demo, "DEMO_VOICE_ENABLED", "true") === "true",
//       chatEnabled: demoVal(demo, "DEMO_CHAT_ENABLED", "true") === "true",
//       kbId: demoVal(demo, "DEMO_KB_ID", "30000000-0000-0000-0000-000000000001"),
//       kbName: demoVal(demo, "DEMO_KB_NAME", "Demo Insurance Knowledge Base"),
//       kbPersona: demoVal(demo, "DEMO_KB_PERSONA", "You are Aria, an AI assistant. Answer questions using information from the knowledge base. Cite sources with [S1], [S2] notation."),
//       orgId: demoVal(demo, "DEMO_ORG_ID", "10000000-0000-0000-0000-000000000001"),
//       voiceGreeting: demoVal(demo, "DEMO_VOICE_GREETING", "Hi! I am Clara, an AI assistant. How can I help you today?"),
//       rateLimitPerHour: parseInt(demoVal(demo, "DEMO_RATE_LIMIT_PER_HOUR", "100"), 10),
//       maxRequestsPerDay: parseInt(demoVal(demo, "DEMO_MAX_REQUESTS_PER_DAY", "1000"), 10),
//     };

//     _demoCache = { data, ts: now };
//     return data;
//   } catch (err) {
//     console.warn("[getDemoSettings] Failed to load, using defaults:", (err as Error).message);
//     return {
//       enabled: true,
//       voiceEnabled: true,
//       chatEnabled: true,
//       kbId: "30000000-0000-0000-0000-000000000001",
//       kbName: "Demo Insurance Knowledge Base",
//       kbPersona: "You are Aria, an AI assistant. Answer questions using information from the knowledge base. Cite sources with [S1], [S2] notation.",
//       orgId: "10000000-0000-0000-0000-000000000001",
//       voiceGreeting: "Hi! I am Clara, an AI assistant. How can I help you today?",
//       rateLimitPerHour: 100,
//       maxRequestsPerDay: 1000,
//     };
//   }
// }
