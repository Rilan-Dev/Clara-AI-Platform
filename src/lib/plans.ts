/**
 * src/lib/plans.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared, client-safe plan ranking helpers.
 *
 * This is the SINGLE source of truth for "is plan A higher/lower than plan B"
 * so the billing UI (Upgrade vs Downgrade button) and the server-side
 * downgrade/validation routes never disagree about direction.
 *
 * Deliberately has ZERO imports (no `@/lib/db`, no server-only modules) so it
 * can be imported from both "use client" components and API routes.
 */

/** Canonical plan ordering, lowest → highest. Keep in sync with subscription_plans seed data. */
export const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

/** Plans a self-serve org user can move between without contacting sales. */
export const SELF_SERVE_PLAN_IDS = ["starter", "pro"] as const;
export type SelfServePlanId = (typeof SELF_SERVE_PLAN_IDS)[number];

export function isSelfServePlan(planId: string): planId is SelfServePlanId {
  return (SELF_SERVE_PLAN_IDS as readonly string[]).includes(planId);
}

export type PlanDirection = "upgrade" | "downgrade" | "same";

/** Compare two plan ids by rank. Unknown plan ids are treated as rank 0 (free-equivalent). */
export function comparePlans(fromPlanId: string, toPlanId: string): PlanDirection {
  const from = PLAN_RANK[fromPlanId] ?? 0;
  const to = PLAN_RANK[toPlanId] ?? 0;
  if (to > from) return "upgrade";
  if (to < from) return "downgrade";
  return "same";
}

export function isUpgrade(fromPlanId: string, toPlanId: string): boolean {
  return comparePlans(fromPlanId, toPlanId) === "upgrade";
}

export function isDowngrade(fromPlanId: string, toPlanId: string): boolean {
  return comparePlans(fromPlanId, toPlanId) === "downgrade";
}
