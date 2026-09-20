/**
 * src/modules/embed/core/subscription-guard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable subscription-enforcement utilities for API key creation.
 *
 * Rules:
 *   - `api_access` must be TRUE on the org's active plan
 *   - `max_api_keys` defines how many keys the org may hold (-1 = unlimited)
 *   - Free plan always returns allowed: false (api_access = FALSE)
 */

import { pool } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiKeyQuota = {
  allowed: boolean;
  reason?: string;
  current: number;   // how many active keys the org currently has
  limit: number;     // max allowed (-1 = unlimited, 0 = none)
  plan: string;      // plan id, e.g. "starter"
  planName: string;  // human-readable, e.g. "Starter"
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch the org's active subscription plan details + current active key count.
 * Returns null if no subscription record exists (treated as free / no access).
 */
async function getOrgSubscriptionDetails(orgId: string): Promise<{
  planId: string;
  planName: string;
  apiAccess: boolean;
  maxApiKeys: number;
  status: string;
} | null> {
  const result = await pool.query<{
    plan_id: string;
    plan_name: string;
    api_access: boolean;
    max_api_keys: number;
    status: string;
  }>(
    `SELECT
       os.plan_id,
       sp.name          AS plan_name,
       sp.api_access,
       sp.max_api_keys,
       os.status
     FROM org_subscriptions os
     JOIN subscription_plans sp ON sp.id = os.plan_id
     WHERE os.org_id = $1
     LIMIT 1`,
    [orgId]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    planId:     row.plan_id,
    planName:   row.plan_name,
    apiAccess:  row.api_access,
    maxApiKeys: row.max_api_keys,
    status:     row.status,
  };
}

async function countActiveApiKeys(orgId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM api_keys WHERE org_id = $1 AND is_active = TRUE`,
    [orgId]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether an org is allowed to create another API key.
 *
 * @example
 * const quota = await checkApiKeyQuota(orgId);
 * if (!quota.allowed) return NextResponse.json({ error: quota.reason }, { status: 403 });
 */
export async function checkApiKeyQuota(orgId: string): Promise<ApiKeyQuota> {
  const [sub, current] = await Promise.all([
    getOrgSubscriptionDetails(orgId),
    countActiveApiKeys(orgId),
  ]);

  // No subscription record → treat as free (no access)
  if (!sub) {
    return {
      allowed: false,
      reason:  "API access requires a Starter plan or above. Please upgrade your subscription.",
      current,
      limit:   0,
      plan:    "free",
      planName: "Free",
    };
  }

  // Subscription is not active (e.g. past_due, canceled)
  if (sub.status !== "active" && sub.status !== "trialing") {
    return {
      allowed:  false,
      reason:   `Your subscription is ${sub.status}. Please update your billing to continue.`,
      current,
      limit:    sub.maxApiKeys,
      plan:     sub.planId,
      planName: sub.planName,
    };
  }

  // Plan does not include API access
  if (!sub.apiAccess) {
    return {
      allowed:  false,
      reason:   `API access is not included in the ${sub.planName} plan. Upgrade to Starter or above.`,
      current,
      limit:    0,
      plan:     sub.planId,
      planName: sub.planName,
    };
  }

  // Unlimited keys (-1)
  if (sub.maxApiKeys === -1) {
    return {
      allowed:  true,
      current,
      limit:    -1,
      plan:     sub.planId,
      planName: sub.planName,
    };
  }

  // At or over the key limit
  if (current >= sub.maxApiKeys) {
    return {
      allowed:  false,
      reason:   `You've reached the ${sub.maxApiKeys}-key limit on the ${sub.planName} plan. Upgrade to create more keys.`,
      current,
      limit:    sub.maxApiKeys,
      plan:     sub.planId,
      planName: sub.planName,
    };
  }

  // All good
  return {
    allowed:  true,
    current,
    limit:    sub.maxApiKeys,
    plan:     sub.planId,
    planName: sub.planName,
  };
}
