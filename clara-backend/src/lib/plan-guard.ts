/**
 * src/lib/plan-guard.ts
 *
 * Enforces subscription plan limits on API routes.
 *
 * Usage inside an API route handler:
 *
 *   import { planGuard } from "@/lib/plan-guard";
 *
 *   export async function POST(req: NextRequest) {
 *     const guard = await planGuard(orgId, "kbs");
 *     if (!guard.allowed) {
 *       return NextResponse.json({ error: guard.reason }, { status: 402 });
 *     }
 *     // proceed…
 *   }
 */

import { query } from "@/lib/db";
import { NextResponse } from "next/server";

// ─── Plan limits as defined in the DB migration ──────────────────────────────

export type PlanLimits = {
  max_kbs:          number;   // -1 = unlimited
  max_docs_per_kb:  number;
  max_req_day:      number;
  max_storage_mb:   number;
  voice_enabled:    boolean;
  api_access:       boolean;
  custom_branding:  boolean;
  sso_enabled:      boolean;
};

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; limitKey: string; current: number; limit: number };

export type LimitKey = "kbs" | "docs_per_kb" | "requests" | "storage" | "voice" | "api" | "branding" | "sso";

// ─── Main guard function ──────────────────────────────────────────────────────

/**
 * Check whether an org is within its plan limits for a given resource.
 *
 * @param orgId   The organisation UUID
 * @param check   What limit to check
 * @param context Optional extra values (e.g. { kbId } for docs_per_kb check)
 */
export async function planGuard(
  orgId: string,
  check: LimitKey,
  context?: { kbId?: string },
): Promise<GuardResult> {
  try {
    // 1. Fetch org's current plan limits
    const planRow = await query<PlanLimits & { plan_id: string }>(
      `
      SELECT
        sp.max_kbs, sp.max_docs_per_kb, sp.max_req_day,
        sp.max_storage_mb, sp.voice_enabled, sp.api_access,
        sp.custom_branding, sp.sso_enabled, sp.id AS plan_id
      FROM subscription_plans sp
      LEFT JOIN org_subscriptions os ON os.org_id = $1
      WHERE sp.id = COALESCE(os.plan_id, 'free')
      LIMIT 1
      `,
      [orgId],
    );

    const plan = planRow.rows[0] as PlanLimits & { plan_id: string } | undefined;

    // If no plan row found, default to free plan limits
    const limits: PlanLimits = plan ?? {
      max_kbs:         1,
      max_docs_per_kb: 20,
      max_req_day:     100,
      max_storage_mb:  100,
      voice_enabled:   false,
      api_access:      false,
      custom_branding: false,
      sso_enabled:     false,
    };

    // 2. Run the specific check
    switch (check) {
      // ── Knowledge Base count ──
      case "kbs": {
        if (limits.max_kbs === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM knowledge_bases
           WHERE org_id = $1 AND status != 'archived'`,
          [orgId],
        );
        const current = countRow.rows[0]?.count ?? 0;
        if (current >= limits.max_kbs) {
          return {
            allowed:  false,
            reason:   `Your plan allows a maximum of ${limits.max_kbs} knowledge base${limits.max_kbs === 1 ? "" : "s"}. Please upgrade to add more.`,
            limitKey: "max_kbs",
            current,
            limit:    limits.max_kbs,
          };
        }
        return { allowed: true };
      }

      // ── Documents per Knowledge Base ──
      case "docs_per_kb": {
        if (!context?.kbId) return { allowed: true };
        if (limits.max_docs_per_kb === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM documents
           WHERE kb_id = $1 AND status != 'deleted'`,
          [context.kbId],
        );
        const current = countRow.rows[0]?.count ?? 0;
        if (current >= limits.max_docs_per_kb) {
          return {
            allowed:  false,
            reason:   `Your plan allows a maximum of ${limits.max_docs_per_kb} documents per knowledge base. Please upgrade to add more.`,
            limitKey: "max_docs_per_kb",
            current,
            limit:    limits.max_docs_per_kb,
          };
        }
        return { allowed: true };
      }

      // ── Daily API request limit ──
      case "requests": {
        if (limits.max_req_day === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM query_events qe
           JOIN knowledge_bases kb ON kb.id = qe.kb_id
           JOIN projects p ON p.id = kb.project_id
           WHERE p.org_id = $1
             AND qe.created_at >= now() - INTERVAL '24 hours'`,
          [orgId],
        );
        const current = countRow.rows[0]?.count ?? 0;
        if (current >= limits.max_req_day) {
          return {
            allowed:  false,
            reason:   `Your plan allows ${limits.max_req_day} requests per day. You have reached this limit. Please upgrade or wait until tomorrow.`,
            limitKey: "max_req_day",
            current,
            limit:    limits.max_req_day,
          };
        }
        return { allowed: true };
      }

      // ── Feature flags ──
      case "voice":
        return limits.voice_enabled
          ? { allowed: true }
          : { allowed: false, reason: "Voice AI is not available on your current plan. Please upgrade to Pro or Enterprise.", limitKey: "voice_enabled", current: 0, limit: 0 };

      case "api":
        return limits.api_access
          ? { allowed: true }
          : { allowed: false, reason: "API access is not available on your current plan. Please upgrade to Pro or Enterprise.", limitKey: "api_access", current: 0, limit: 0 };

      case "branding":
        return limits.custom_branding
          ? { allowed: true }
          : { allowed: false, reason: "Custom branding is not available on your current plan. Please upgrade to Pro or Enterprise.", limitKey: "custom_branding", current: 0, limit: 0 };

      case "sso":
        return limits.sso_enabled
          ? { allowed: true }
          : { allowed: false, reason: "SSO is only available on the Enterprise plan.", limitKey: "sso_enabled", current: 0, limit: 0 };

      // ── Storage (future — currently informational) ──
      case "storage":
        return { allowed: true };

      default:
        return { allowed: true };
    }
  } catch (err) {
    // On DB errors, fail open (don't block the request)
    console.error("[planGuard] error:", err);
    return { allowed: true };
  }
}

/**
 * Convenience: Return a 402 Payment Required response when a plan limit is hit.
 *
 * Usage:
 *   const guard = await planGuard(orgId, "kbs");
 *   if (!guard.allowed) return planLimitResponse(guard);
 */
export function planLimitResponse(guard: GuardResult & { allowed: false }): Response {
  return NextResponse.json(
    {
      error:    "plan_limit_exceeded",
      message:  guard.reason,
      limitKey: guard.limitKey,
      current:  guard.current,
      limit:    guard.limit,
    },
    { status: 402 },
  );
}

/**
 * Fetch the full plan limits for an org (useful for UI usage indicators).
 */
export async function getOrgPlanLimits(orgId: string): Promise<PlanLimits & { plan_id: string }> {
  const row = await query<PlanLimits & { plan_id: string }>(
    `
    SELECT sp.id AS plan_id, sp.max_kbs, sp.max_docs_per_kb, sp.max_req_day,
           sp.max_storage_mb, sp.voice_enabled, sp.api_access,
           sp.custom_branding, sp.sso_enabled
    FROM subscription_plans sp
    LEFT JOIN org_subscriptions os ON os.org_id = $1
    WHERE sp.id = COALESCE(os.plan_id, 'free')
    LIMIT 1
    `,
    [orgId],
  );

  return row.rows[0] ?? {
    plan_id:         "free",
    max_kbs:         1,
    max_docs_per_kb: 20,
    max_req_day:     100,
    max_storage_mb:  100,
    voice_enabled:   false,
    api_access:      false,
    custom_branding: false,
    sso_enabled:     false,
  };
}
