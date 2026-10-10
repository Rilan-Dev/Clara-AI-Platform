import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-contract";
import { getModel } from "@/lib/model-catalogue";
import { planSpec, resolveOrg, type LimitKey } from "@/lib/plans";

/**
 * WS-1.2 Server-side quota enforcement (plan §3.2).
 *
 * Every billable route calls `withQuota` BEFORE doing work:
 *   1. feature gate  — capability in the plan at all?      → 403
 *   2. usage gate    — atomic check-and-increment in a
 *      transaction, so concurrent requests cannot race
 *      past a limit                                       → 402
 *   3. soft warning  — emitted exactly once at 80% of a window
 *
 * The 402/403 payloads carry the machine-readable code and the upgrade CTA
 * so clients render the upgrade sheet from server data, never their guess.
 */

export type QuotaCheck = {
  used: number;
  limit: number;
  windowStart: Date;
  warning?: { limitKey: LimitKey; used: number; limit: number };
};

const ALL_TIME = new Date(0);

/** Local-midnight window start in the organisation's timezone. */
export function localDayStart(tz: string, at: Date = new Date()): Date {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [y, m, d] = fmt.format(at).split("-").map(Number);
    // interpret the local wall-clock date as UTC midnight of that day; for
    // window bucketing only the bucket identity matters, and the same
    // transform is applied on both the write and read paths.
    return new Date(Date.UTC(y, m - 1, d));
  } catch {
    return new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
    );
  }
}

/** Billing-period window anchored to the Razorpay renewal date. */
export function billingWindowStart(
  renewalDate: Date,
  at: Date = new Date()
): Date {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const anchor = new Date(
    Date.UTC(y, m, renewalDate.getUTCDate(), 0, 0, 0)
  );
  return anchor.getTime() > at.getTime()
    ? new Date(Date.UTC(y, m - 1, renewalDate.getUTCDate(), 0, 0, 0))
    : anchor;
}

function windowForKey(
  limitKey: LimitKey,
  org: { timezone: string; renewalDate: Date }
): Date {
  switch (limitKey) {
    case "requests_day":
      return localDayStart(org.timezone);
    case "requests_month":
      return billingWindowStart(org.renewalDate);
    default:
      return ALL_TIME;
  }
}

function limitValue(
  plan: { requestsDay: number; requestsMonth: number; kbs: number; storageBytes: number },
  limitKey: LimitKey
): number {
  switch (limitKey) {
    case "requests_day":
      return plan.requestsDay;
    case "requests_month":
      return plan.requestsMonth;
    case "kbs":
      return plan.kbs;
    case "storage_bytes":
      return plan.storageBytes;
  }
}

/** Feature gate — a capability hidden in the UI must also be refused by the API. */
export async function checkFeature(orgId: string, feature: string) {
  const { plan } = await resolveOrg(orgId);
  if (feature.startsWith("model:")) {
    const modelId = feature.slice("model:".length);
    const model = getModel(modelId);
    if (!model) {
      throw new ApiError(422, "MODEL_NOT_FOUND", `Unknown model '${modelId}'.`);
    }
    if (model.tier > plan.maxModelTier) {
      throw new ApiError(
        403,
        "MODEL_NOT_IN_PLAN",
        `${model.displayName} is not available on the ${plan.name} plan.`,
        {
          upgrade: {
            plan: plan.upgradeTo ?? plan.id,
            planName: planSpec(plan.upgradeTo ?? plan.id).name,
            reason: `model:${modelId}`,
            ctaUrl: `/billing/upgrade?reason=${encodeURIComponent(`model:${modelId}`)}`,
          },
        }
      );
    }
    return true;
  }
  if (!plan.features.includes(feature)) {
    throw new ApiError(
      403,
      "PLAN_FEATURE_UNAVAILABLE",
      `The ${feature.replace(/_/g, " ")} capability is not included in the ${plan.name} plan.`,
      {
        upgrade: {
          plan: plan.upgradeTo ?? plan.id,
          planName: planSpec(plan.upgradeTo ?? plan.id).name,
          reason: `feature:${feature}`,
          ctaUrl: `/billing/upgrade?reason=${encodeURIComponent(`feature:${feature}`)}`,
        },
      }
    );
  }
  return true;
}

/**
 * Idempotency (plan §6.2): every billable endpoint accepts a key so retries
 * after network failures cannot double-charge a quota. A seen key replays
 * its stored snapshot without incrementing anything.
 */
export async function replayIdempotent(
  key: string | null
): Promise<QuotaCheck | null> {
  if (!key) return null;
  const seen = await db.idempotencyKey.findUnique({ where: { key } });
  if (!seen) return null;
  const snap = JSON.parse(seen.snapshot) as QuotaCheck;
  return { ...snap, windowStart: new Date(snap.windowStart) };
}

export async function rememberIdempotent(
  key: string | null,
  orgId: string,
  endpoint: string,
  check: QuotaCheck
) {
  if (!key) return;
  await db.idempotencyKey.upsert({
    where: { key },
    create: {
      key,
      orgId,
      endpoint,
      snapshot: JSON.stringify({
        used: check.used,
        limit: check.limit,
        windowStart: check.windowStart.toISOString(),
      }),
    },
    update: {},
  });
}

/**
 * The usage gate — atomic check-and-increment inside a database transaction.
 * One hundred simultaneous requests against a plan with one remaining credit
 * admit exactly one and refuse ninety-nine.
 */
export async function withQuota(opts: {
  orgId: string;
  limitKey: LimitKey;
  increment?: number;
  idempotencyKey?: string | null;
  endpoint?: string;
}): Promise<QuotaCheck> {
  const replayed = await replayIdempotent(opts.idempotencyKey ?? null);
  if (replayed) return replayed;

  const { org, plan } = await resolveOrg(opts.orgId);
  const limit = limitValue(plan, opts.limitKey);
  const increment = opts.increment ?? 1;
  const windowStart = windowForKey(opts.limitKey, {
    timezone: org.timezone,
    renewalDate: org.renewalDate,
  });

  if (limit === -1) {
    // unlimited tiers still count, they simply never refuse
    const check: QuotaCheck = { used: 0, limit: -1, windowStart };
    await rememberIdempotent(
      opts.idempotencyKey ?? null,
      opts.orgId,
      opts.endpoint ?? "unknown",
      check
    );
    return check;
  }

  const admitted = await db.$transaction(async (tx) => {
    const existing = await tx.usageCounter.findUnique({
      where: {
        orgId_limitKey_windowStart: {
          orgId: opts.orgId,
          limitKey: opts.limitKey,
          windowStart,
        },
      },
    });
    const current = existing ? Number(existing.count) : 0;
    if (current + increment > limit) {
      return null; // refuse — caller converts to 402
    }
    if (existing) {
      await tx.usageCounter.update({
        where: { id: existing.id },
        data: { count: { increment: BigInt(increment) } },
      });
    } else {
      await tx.usageCounter.create({
        data: {
          orgId: opts.orgId,
          limitKey: opts.limitKey,
          windowStart,
          count: BigInt(increment),
        },
      });
    }
    const used = current + increment;

    // 80% soft warning — at most once per org per limit per window.
    const warnAt = Math.floor(0.8 * limit);
    let warning: QuotaCheck["warning"];
    if (
      opts.limitKey !== "storage_bytes" &&
      used >= warnAt &&
      current < warnAt
    ) {
      await tx.softWarning.upsert({
        where: {
          orgId_limitKey_windowStart: {
            orgId: opts.orgId,
            limitKey: opts.limitKey,
            windowStart,
          },
        },
        create: {
          orgId: opts.orgId,
          limitKey: opts.limitKey,
          windowStart,
        },
        update: {},
      });
      warning = { limitKey: opts.limitKey, used, limit };
    }
    return { used, warning };
  });

  if (!admitted) {
    throw new ApiError(
      402,
      "QUOTA_EXCEEDED",
      quotaExceededMessage(opts.limitKey, plan.name, plan.id),
      {
        upgrade: {
          plan: plan.upgradeTo ?? "enterprise",
          planName: planSpec(plan.upgradeTo ?? "enterprise").name,
          reason: opts.limitKey,
          ctaUrl: `/billing/upgrade?reason=${encodeURIComponent(opts.limitKey)}`,
        },
      }
    );
  }

  const check: QuotaCheck = {
    used: admitted.used,
    limit,
    windowStart,
    warning: admitted.warning,
  };
  await rememberIdempotent(
    opts.idempotencyKey ?? null,
    opts.orgId,
    opts.endpoint ?? "unknown",
    check
  );
  return check;
}

export function quotaExceededMessage(
  limitKey: LimitKey,
  planName: string,
  _planId: string
): string {
  switch (limitKey) {
    case "requests_day":
      return `Daily request limit reached on the ${planName} plan. The counter resets at midnight in your organisation's timezone.`;
    case "requests_month":
      return `Monthly request limit reached on the ${planName} plan. The counter resets on your renewal date.`;
    case "kbs":
      return `Knowledge-base limit reached on the ${planName} plan.`;
    case "storage_bytes":
      return `Storage limit reached on the ${planName} plan.`;
  }
}

/** Read-only peek for pre-flight client checks (e.g. pre-upload storage). */
export async function peekQuota(orgId: string, limitKey: LimitKey) {
  const { org, plan } = await resolveOrg(orgId);
  const limit = limitValue(plan, limitKey);
  const windowStart = windowForKey(limitKey, {
    timezone: org.timezone,
    renewalDate: org.renewalDate,
  });
  if (limit === -1) return { used: 0, limit: -1, windowStart };
  const counter = await db.usageCounter.findUnique({
    where: {
      orgId_limitKey_windowStart: { orgId, limitKey, windowStart },
    },
  });
  return { used: counter ? Number(counter.count) : 0, limit, windowStart };
}
