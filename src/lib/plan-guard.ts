/**
 * src/lib/plan-guard.ts
 *
 * Enforces subscription plan limits on API routes.
 *
 * Usage inside an API route handler:
 *
 *   import { planGuard, planLimitResponse } from "@/lib/plan-guard";
 *
 *   export async function POST(req: NextRequest) {
 *     const guard = await planGuard(orgId, "kbs");
 *     if (!guard.allowed) return planLimitResponse(guard);
 *     // proceed…
 *   }
 *
 * Anti-bypass guarantees:
 *   • Daily request quota counts rows in query_events inserted at REQUEST time
 *     (status='pending'), so aborting a stream does not dodge the counter.
 *   • The quota window is a rolling 24 hours — no midnight-reset abuse.
 *   • Expired / past_due / paused / cancelled subscriptions are downgraded to
 *     FREE plan limits, matching the "premium features and higher limits are
 *     restricted" promise shown in the billing UI.
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
  // Voice budgets (ElevenLabs integration, migration 033). -1 = unlimited —
  // dormant by default so voice usage behaves exactly like existing providers.
  max_tts_chars_day:     number;
  max_stt_audio_sec_day: number;
};

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; limitKey: string; current: number; limit: number };

export type LimitKey = "kbs" | "docs_per_kb" | "requests" | "storage" | "voice" | "api" | "branding" | "sso" | "tts" | "stt";

const FREE_FALLBACK_LIMITS: PlanLimits = {
  max_kbs:         1,
  max_docs_per_kb: 10,
  max_req_day:     100,
  max_storage_mb:  100,
  voice_enabled:   false,
  api_access:      false,
  custom_branding: false,
  sso_enabled:     false,
  max_tts_chars_day:     -1,
  max_stt_audio_sec_day: -1,
};

// Statuses that keep the subscribed plan's limits. Everything else
// (expired / past_due / paused / cancelled) falls back to free-tier limits.
const FULL_LIMIT_STATUSES = new Set(["active", "trialing"]);

/** Byte threshold warnings kick in at 80% of any numeric limit. */
export const NEAR_LIMIT_PCT = 80;

// ─── Internal: resolve the effective limits for an org ────────────────────────

export type EffectiveLimits = PlanLimits & {
  plan_id:     string;
  plan_name:   string;
  status:      string;            // raw subscription status ('none' if no row)
  downgraded:  boolean;           // true → free limits applied (expired etc.)
};

/** Minimal query interface so limits can be resolved inside a transaction. */
export type SqlExecutor = {
  query<T extends { [key: string]: unknown }>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
};

/**
 * Resolve the effective plan limits for an org. `via` defaults to the shared
 * pool; pass a transaction client so quota admission (WS-1.2) can resolve
 * limits and count usage under one advisory lock — closing the TOCTOU race
 * where two concurrent requests both pass a count-then-insert check.
 */
export async function resolveOrgPlanLimits(
  orgId: string,
  via?: SqlExecutor,
): Promise<EffectiveLimits> {
  const run = via ?? { query };
  const rows = await run.query<{
    plan_id: string; plan_name: string; status: string;
    current_period_end: string | null;
    max_kbs: number; max_docs_per_kb: number; max_req_day: number; max_storage_mb: number;
    voice_enabled: boolean; api_access: boolean; custom_branding: boolean; sso_enabled: boolean;
    max_tts_chars_day: number; max_stt_audio_sec_day: number;
  }>(
    `SELECT os.plan_id,
            COALESCE(pv.name, sp.name)             AS plan_name,
            os.status,
            os.current_period_end,
            COALESCE(pv.max_kbs, sp.max_kbs)         AS max_kbs,
            COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
            COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
            COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
            COALESCE(pv.voice_enabled, sp.voice_enabled)   AS voice_enabled,
            COALESCE(pv.api_access, sp.api_access)         AS api_access,
            COALESCE(pv.custom_branding, sp.custom_branding) AS custom_branding,
            COALESCE(pv.sso_enabled, sp.sso_enabled)       AS sso_enabled,
            COALESCE(pv.max_tts_chars_day, sp.max_tts_chars_day, -1) AS max_tts_chars_day,
            COALESCE(pv.max_stt_audio_sec_day, sp.max_stt_audio_sec_day, -1) AS max_stt_audio_sec_day
       FROM org_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
       LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
      WHERE os.org_id = $1
      ORDER BY os.updated_at DESC
      LIMIT 1`,
    [orgId]
  );

  const sub = rows[0];

  // No subscription row → free tier.
  if (!sub) {
    const free = await fetchPlanRow("free", via);
    return {
      ...(free ?? FREE_FALLBACK_LIMITS),
      plan_id: "free", plan_name: free?.plan_name ?? "Free",
      status: "none", downgraded: false,
    };
  }

  // Subscription exists but is not in good standing → free-tier limits.
  // (`expired` = active/trialing with a past current_period_end, or past_due.)
  const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const isExpired = end !== null && end < Date.now();
  if (!FULL_LIMIT_STATUSES.has(sub.status) || isExpired) {
    const free = await fetchPlanRow("free", via);
    return {
      ...(free ?? FREE_FALLBACK_LIMITS),
      plan_id: sub.plan_id, plan_name: sub.plan_name,
      status: sub.status, downgraded: true,
    };
  }

  return { ...sub, downgraded: false };
}

async function fetchPlanRow(
  planId: string,
  via?: SqlExecutor,
): Promise<PlanLimits & { plan_name: string } | null> {
  const run = via ?? { query };
  const rows = await run.query<PlanLimits & { plan_name: string }>(
    `SELECT sp.id AS plan_id, sp.name AS plan_name,
            sp.max_kbs, sp.max_docs_per_kb, sp.max_req_day, sp.max_storage_mb,
            sp.voice_enabled, sp.api_access, sp.custom_branding, sp.sso_enabled
       FROM subscription_plans sp
      WHERE sp.id = $1`,
    [planId]
  );
  return rows[0] ?? null;
}

// ─── Main guard function ──────────────────────────────────────────────────────

/**
 * Check whether an org is within its plan limits for a given resource.
 *
 * @param orgId   The organisation UUID
 * @param check   What limit to check
 * @param context Optional extra values:
 *                  { kbId }          for docs_per_kb
 *                  { incomingBytes } for storage (size of the new upload)
 */
export async function planGuard(
  orgId: string,
  check: LimitKey,
  context?: { kbId?: string; incomingBytes?: number },
): Promise<GuardResult> {
  try {
    const limits = await resolveOrgPlanLimits(orgId);

    switch (check) {

      // ── Knowledge Base count (org-wide, across all agents) ──
      case "kbs": {
        if (limits.max_kbs === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM knowledge_bases kb
             JOIN agents a ON a.id = kb.agent_id
            WHERE a.org_id = $1 AND kb.status != 'archived'`,
          [orgId]
        );
        const current = countRow[0]?.count ?? 0;
        if (current >= limits.max_kbs) {
          return {
            allowed: false,
            reason: `Your ${limits.plan_name} plan allows a maximum of ${limits.max_kbs} knowledge base${limits.max_kbs === 1 ? "" : "s"}.${limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : ""} Upgrade to add more.`,
            limitKey: "max_kbs",
            current,
            limit: limits.max_kbs,
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
          [context.kbId]
        );
        const current = countRow[0]?.count ?? 0;
        if (current >= limits.max_docs_per_kb) {
          return {
            allowed: false,
            reason: `Your ${limits.plan_name} plan allows a maximum of ${limits.max_docs_per_kb} documents per knowledge base.${limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : ""} Upgrade to add more.`,
            limitKey: "max_docs_per_kb",
            current,
            limit: limits.max_docs_per_kb,
          };
        }
        return { allowed: true };
      }

      // ── Daily request limit (rolling 24h window — anti midnight-reset bypass) ──
      case "requests": {
        if (limits.max_req_day === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
             FROM query_events
            WHERE org_id = $1
              AND created_at >= now() - INTERVAL '24 hours'`,
          [orgId]
        );
        const current = countRow[0]?.count ?? 0;
        if (current >= limits.max_req_day) {
          return {
            allowed: false,
            reason: `Daily request limit reached — your ${limits.plan_name} plan allows ${limits.max_req_day.toLocaleString()} requests per day (you've used ${current.toLocaleString()} in the last 24 hours). The counter rolls off continuously as requests age out.${limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : ""} Upgrade your plan for more requests.`,
            limitKey: "max_req_day",
            current,
            limit: limits.max_req_day,
          };
        }
        return { allowed: true };
      }

      // ── Storage (documents across all KBs of the org) ──
      case "storage": {
        if (limits.max_storage_mb === -1) return { allowed: true };
        const maxBytes = limits.max_storage_mb * 1024 * 1024;
        const countRow = await query<{ used: string }>(
          `SELECT COALESCE(SUM(d.file_size), 0)::text AS used
             FROM documents d
             JOIN knowledge_bases kb ON kb.id = d.kb_id
             JOIN agents a ON a.id = kb.agent_id
            WHERE a.org_id = $1 AND d.status != 'deleted'`,
          [orgId]
        );
        const current = Number(countRow[0]?.used ?? 0);
        const incoming = context?.incomingBytes ?? 0;
        if (current + incoming > maxBytes) {
          const usedMb = (current / 1024 / 1024).toFixed(1);
          return {
            allowed: false,
            reason: `Storage limit exceeded — your ${limits.plan_name} plan includes ${limits.max_storage_mb.toLocaleString()} MB and you're using ${usedMb} MB.${limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : ""} Delete unused documents or upgrade your plan.`,
            limitKey: "max_storage_mb",
            current: current + incoming,
            limit: maxBytes,
          };
        }
        return { allowed: true };
      }

      // ── Feature flags (also require an in-good-standing subscription) ──
      case "voice":
        return limits.voice_enabled
          ? { allowed: true }
          : { allowed: false, reason: `Voice assistant is not available on your current plan${limits.downgraded ? " (subscription not active — free-plan limits apply)" : ""}. Upgrade to Starter or above.`, limitKey: "voice_enabled", current: 0, limit: 0 };

      case "api":
        return limits.api_access
          ? { allowed: true }
          : { allowed: false, reason: `API access is not available on your current plan${limits.downgraded ? " (subscription not active — free-plan limits apply)" : ""}. Upgrade to Starter or above.`, limitKey: "api_access", current: 0, limit: 0 };

      case "branding":
        return limits.custom_branding
          ? { allowed: true }
          : { allowed: false, reason: `Custom branding is not available on your current plan. Upgrade to Pro or Enterprise.`, limitKey: "custom_branding", current: 0, limit: 0 };

      case "sso":
        return limits.sso_enabled
          ? { allowed: true }
          : { allowed: false, reason: `SSO / SAML is only available on the Enterprise plan.`, limitKey: "sso_enabled", current: 0, limit: 0 };

      // ── Voice budgets (ElevenLabs, dormant by default: -1 = unlimited) ──
      case "tts": {
        if (limits.max_tts_chars_day === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COALESCE(SUM(prompt_tokens), 0)::int AS count
             FROM usage_events
            WHERE org_id = $1 AND kind = 'TTS'
              AND created_at >= now() - INTERVAL '24 hours'`,
          [orgId]
        );
        const current = countRow[0]?.count ?? 0;
        if (current >= limits.max_tts_chars_day) {
          return {
            allowed: false,
            reason: `Daily voice synthesis limit reached — your ${limits.plan_name} plan allows ${limits.max_tts_chars_day.toLocaleString()} spoken characters per day (rolling 24 hours).${limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : ""}`,
            limitKey: "max_tts_chars_day",
            current,
            limit: limits.max_tts_chars_day,
          };
        }
        return { allowed: true };
      }

      case "stt": {
        if (limits.max_stt_audio_sec_day === -1) return { allowed: true };
        const countRow = await query<{ count: number }>(
          `SELECT COALESCE(SUM(prompt_tokens), 0)::int AS count
             FROM usage_events
            WHERE org_id = $1 AND kind = 'TRANSCRIPTION'
              AND created_at >= now() - INTERVAL '24 hours'`,
          [orgId]
        );
        const current = countRow[0]?.count ?? 0;
        if (current >= limits.max_stt_audio_sec_day) {
          return {
            allowed: false,
            reason: `Daily speech recognition limit reached — your ${limits.plan_name} plan allows ${Math.round(limits.max_stt_audio_sec_day / 60).toLocaleString()} listening minutes per day (rolling 24 hours).${limits.downgraded ? " Your subscription is not active, so free-plan limits apply." : ""}`,
            limitKey: "max_stt_audio_sec_day",
            current,
            limit: limits.max_stt_audio_sec_day,
          };
        }
        return { allowed: true };
      }

      default:
        return { allowed: true };
    }
  } catch (err) {
    // On DB errors the guard fails open by default (documented rationale: a
    // genuine DB outage also fails the subsequent mutation itself, so this
    // cannot be abused to bypass limits). Operators who prefer hard closure
    // can set PLAN_GUARD_FAIL_MODE=closed — the request is then refused with
    // 503 instead of silently proceeding (WS-1.2 defence-in-depth option).
    console.error("[planGuard] error:", err);
    if (process.env.PLAN_GUARD_FAIL_MODE?.toLowerCase() === "closed") {
      return {
        allowed: false,
        reason: "Plan limits could not be verified right now. Please try again shortly.",
        limitKey: "plan_guard_unavailable",
        current: 0,
        limit: 0,
      };
    }
    return { allowed: true };
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Return a 402 Payment Required response when a plan limit is hit.
 * Includes a machine-readable `code` so front-ends can render upgrade CTAs.
 */
export function planLimitResponse(guard: GuardResult & { allowed: false }): Response {
  return NextResponse.json(
    {
      error:    "plan_limit_exceeded",
      code:     "plan_limit_exceeded",
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
  const limits = await resolveOrgPlanLimits(orgId).catch(() => null);
  if (limits) {
    const { plan_name: _planName, status: _status, downgraded: _dg, ...rest } = limits;
    return rest;
  }
  return { plan_id: "free", ...FREE_FALLBACK_LIMITS };
}

// ─── Usage monitoring (dashboards) ────────────────────────────────────────────

export type OrgUsageSnapshot = {
  plan_id: string;
  plan_name: string;
  status: string;
  downgraded: boolean;
  usage: {
    kb_count: number;
    doc_count: number;
    max_docs_in_kb: number;
    storage_bytes: number;
    requests_today: number;   // IST calendar day
    requests_24h: number;
    api_keys_active: number;
  };
  limits: PlanLimits;
};

/**
 * Combined usage-vs-limits snapshot for usage meters and monitoring.
 * "Today" uses the Asia/Kolkata calendar day (the platform's business
 * timezone) — the Postgres server runs UTC, which made the "queries today"
 * KPI show 0 for IST users chatting after midnight.
 */
export async function getOrgUsageSnapshot(orgId: string): Promise<OrgUsageSnapshot> {
  const limits = await resolveOrgPlanLimits(orgId);

  const usageR = await query<{
    kb_count: number;
    doc_count: number;
    max_docs_in_kb: number;
    storage_bytes: string;
    requests_today: number;
    requests_24h: number;
    api_keys_active: number;
  }>(
    `SELECT
      (SELECT COUNT(*)::int FROM knowledge_bases kb JOIN agents a ON a.id = kb.agent_id
        WHERE a.org_id = $1 AND kb.status != 'archived') AS kb_count,
      (SELECT COUNT(*)::int FROM documents d JOIN knowledge_bases kb ON kb.id = d.kb_id
        JOIN agents a ON a.id = kb.agent_id WHERE a.org_id = $1 AND d.status != 'deleted') AS doc_count,
      (SELECT COALESCE(MAX(cnt), 0)::int FROM (
          SELECT COUNT(*)::int AS cnt FROM documents d JOIN knowledge_bases kb ON kb.id = d.kb_id
           JOIN agents a ON a.id = kb.agent_id
          WHERE a.org_id = $1 AND d.status != 'deleted'
          GROUP BY kb.id
        ) per_kb) AS max_docs_in_kb,
      (SELECT COALESCE(SUM(d.file_size),0)::text FROM documents d JOIN knowledge_bases kb ON kb.id = d.kb_id
        JOIN agents a ON a.id = kb.agent_id WHERE a.org_id = $1 AND d.status != 'deleted') AS storage_bytes,
      (SELECT COUNT(*)::int FROM query_events
        WHERE org_id = $1
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date
              = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS requests_today,
      (SELECT COUNT(*)::int FROM query_events
        WHERE org_id = $1 AND created_at >= now() - INTERVAL '24 hours') AS requests_24h,
      (SELECT COUNT(*)::int FROM api_keys WHERE org_id = $1 AND is_active = TRUE) AS api_keys_active`,
    [orgId]
  );

  const u = usageR[0];
  const { plan_name, status, downgraded, ...planLimits } = limits;
  return {
    plan_id: limits.plan_id,
    plan_name,
    status,
    downgraded,
    usage: {
      kb_count:          u?.kb_count ?? 0,
      doc_count:         u?.doc_count ?? 0,
      max_docs_in_kb:    u?.max_docs_in_kb ?? 0,
      storage_bytes:     Number(u?.storage_bytes ?? 0),
      requests_today:    u?.requests_today ?? 0,
      requests_24h:      u?.requests_24h ?? 0,
      api_keys_active:   u?.api_keys_active ?? 0,
    },
    limits: planLimits,
  };
}
