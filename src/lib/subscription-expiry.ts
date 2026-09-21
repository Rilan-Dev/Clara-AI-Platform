/**
 * src/lib/subscription-expiry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription lifecycle engine — the "renewal clock" of the platform.
 *
 *   1. Renewal reminders: paid subscriptions ending within 7 days get a
 *      reminder email (deduped once per billing period).
 *      - ACTIVE subscriptions → renewal_reminder
 *      - TRIALING subscriptions → trial_ending_soon (3-day window)
 *   2. Expiry sweep: paid subscriptions past their current_period_end are
 *      moved to `past_due` and the owner receives an "expired — renew"
 *      email (deduped once per billing period).
 *   3. Due self-serve downgrades are applied at current_period_end.
 *
 * Free plans never expire (perpetual). Sweep runs:
 *   - once on server startup (src/instrumentation.ts)
 *   - every 6 hours after that
 *   - on demand via POST /api/subscriptions/expiry-sweep (super-admin)
 *
 * Renewal itself happens through the existing payment flows
 * (/api/subscriptions/razorpay/order + verify, /api/subscriptions/checkout)
 * — a successful payment flips the subscription back to `active` with a
 * fresh 1-month period.
 */

import { query } from "@/lib/db";
import { getOrgOwnerEmail, queueNotification, writeSubscriptionAudit } from "@/lib/subscription-notifications";

const REMINDER_WINDOW_DAYS = 7;
const TRIAL_REMINDER_WINDOW_DAYS = 3;

type DueSubscription = {
  org_id:               string;
  org_name:             string;
  plan_id:              string;
  plan_name:            string;
  status:               string;
  current_period_start: string;
  current_period_end:   string;
  owner_email:          string | null;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Has a notification of this type already been sent for the CURRENT period? */
async function alreadyNotified(orgId: string, type: string, periodStart: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM subscription_notifications
      WHERE org_id = $1 AND notification_type = $2 AND created_at >= $3::timestamptz
      LIMIT 1`,
    [orgId, type, periodStart]
  );
  return rows.length > 0;
}

export type SweepResult = {
  checked:        number;
  reminded:       number;
  trialReminded:  number;
  expired:        number;
  downgraded:     number;
  errors:         string[];
};

type DueDowngrade = {
  org_id:             string;
  org_name:           string;
  plan_id:            string;       // current plan (about to change)
  old_plan_name:      string;
  scheduled_plan_id:  string;       // target plan
  new_plan_name:      string;
  owner_email:        string | null;
};

/**
 * Run the full lifecycle pass. Safe to call repeatedly — every action is
 * deduped and idempotent.
 */
export async function sweepSubscriptionExpiry(): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, reminded: 0, trialReminded: 0, expired: 0, downgraded: 0, errors: [] };

  try {
    // Paid, non-terminal subscriptions only. Free is perpetual.
    const subs = await query<DueSubscription>(`
      SELECT os.org_id, o.name AS org_name, os.plan_id, sp.name AS plan_name,
             os.status, os.current_period_start::text AS current_period_start,
             os.current_period_end::text AS current_period_end
        FROM org_subscriptions os
        JOIN organisations o   ON o.id = os.org_id
        JOIN subscription_plans sp ON sp.id = os.plan_id
       WHERE os.status IN ('active', 'trialing')
         AND sp.price_usd > 0
         AND os.current_period_end IS NOT NULL
    `);

    result.checked = subs.length;

    for (const sub of subs) {
      try {
        const periodEnd   = new Date(sub.current_period_end);
        const now         = new Date();
        const msLeft      = periodEnd.getTime() - now.getTime();
        const daysLeft    = Math.ceil(msLeft / 86_400_000);

        // ── 1. Already expired → past_due + expiry email ────────────────────
        if (msLeft <= 0) {
          const notified = await alreadyNotified(sub.org_id, "subscription_expired", sub.current_period_start);
          if (notified) continue;

          await query(
            `UPDATE org_subscriptions SET status = 'past_due', updated_at = now() WHERE org_id = $1`,
            [sub.org_id]
          );
          await writeSubscriptionAudit({
            orgId: sub.org_id,
            actorLabel: "system",
            action: "expired",
            oldStatus: sub.status,
            newStatus: "past_due",
            oldPlanId: sub.plan_id,
            note: "Period ended automatically (expiry sweep)",
          });

          const ownerEmail = await getOrgOwnerEmail(sub.org_id);
          if (ownerEmail) {
            await queueNotification({
              orgId: sub.org_id,
              orgName: sub.org_name,
              recipientEmail: ownerEmail,
              type: "subscription_expired",
              data: {
                orgName: sub.org_name,
                planName: sub.plan_name,
                trialEnd: formatDate(sub.current_period_end),
              },
            });
          }
          result.expired++;
          continue;
        }

        // ── 2. Ending within the reminder window → reminder email ─────────
        // Active subs get renewal_reminder (7-day window); trials get the
        // softer trial_ending_soon nudge (3-day window) so trial owners are
        // prompted to upgrade without a renewal-style warning.
        const isTrial         = sub.status === "trialing";
        const reminderType    = isTrial ? "trial_ending_soon" : "renewal_reminder";
        const reminderWindow  = isTrial ? TRIAL_REMINDER_WINDOW_DAYS : REMINDER_WINDOW_DAYS;

        if (daysLeft <= reminderWindow) {
          const notified = await alreadyNotified(sub.org_id, reminderType, sub.current_period_start);
          if (notified) continue;

          const ownerEmail = await getOrgOwnerEmail(sub.org_id);
          if (ownerEmail) {
            await queueNotification({
              orgId: sub.org_id,
              orgName: sub.org_name,
              recipientEmail: ownerEmail,
              type: reminderType,
              data: {
                orgName: sub.org_name,
                planName: sub.plan_name,
                trialEnd: formatDate(sub.current_period_end),
                trialDays: String(daysLeft),
              },
            });
            if (isTrial) result.trialReminded++;
            else         result.reminded++;
          }
        }
      } catch (err) {
        result.errors.push(`${sub.org_name}: ${(err as Error).message}`);
      }
    }

    // ── 3. Apply due self-serve downgrades ────────────────────────────────
    // Scheduled by POST /api/subscriptions/downgrade at current_period_end.
    // No payment involved — this only flips plan_id and clears the schedule.
    const dueDowngrades = await query<DueDowngrade>(`
      SELECT os.org_id, o.name AS org_name, os.plan_id, sp.name AS old_plan_name,
             os.scheduled_plan_id, newsp.name AS new_plan_name
        FROM org_subscriptions os
        JOIN organisations o ON o.id = os.org_id
        JOIN subscription_plans sp ON sp.id = os.plan_id
        JOIN subscription_plans newsp ON newsp.id = os.scheduled_plan_id
       WHERE os.scheduled_plan_id IS NOT NULL
         AND os.scheduled_at IS NOT NULL
         AND os.scheduled_at <= now()
    `);

    for (const dg of dueDowngrades) {
      try {
        await query(
          `UPDATE org_subscriptions
              SET plan_id = scheduled_plan_id, scheduled_plan_id = NULL, scheduled_at = NULL,
                  updated_at = now()
            WHERE org_id = $1`,
          [dg.org_id]
        );
        await writeSubscriptionAudit({
          orgId: dg.org_id,
          actorLabel: "system",
          action: "downgrade_applied",
          oldPlanId: dg.plan_id,
          newPlanId: dg.scheduled_plan_id,
          note: "Scheduled downgrade applied at period end (expiry sweep)",
        });

        const ownerEmail = await getOrgOwnerEmail(dg.org_id);
        if (ownerEmail) {
          await queueNotification({
            orgId: dg.org_id,
            orgName: dg.org_name,
            recipientEmail: ownerEmail,
            type: "downgrade_applied",
            data: { orgName: dg.org_name, oldPlan: dg.old_plan_name, newPlan: dg.new_plan_name },
          });
        }
        result.downgraded++;
      } catch (err) {
        result.errors.push(`${dg.org_name} (downgrade): ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push(`sweep: ${(err as Error).message}`);
  }

  if (result.expired || result.reminded || result.trialReminded || result.downgraded || result.errors.length) {
    console.log(
      `[subscription-expiry] checked=${result.checked} reminded=${result.reminded} trialReminded=${result.trialReminded} expired=${result.expired} downgraded=${result.downgraded}` +
      (result.errors.length ? ` errors=${JSON.stringify(result.errors)}` : "")
    );
  }
  return result;
}

// ── Effective subscription view (used by dashboards + billing) ────────────────

export type EffectiveSubscription = {
  planId:           string;
  planName:         string;
  status:           string;          // raw DB status
  effectiveStatus:  "active" | "trialing" | "expiring" | "expired" | "paused" | "cancelled" | "past_due" | "inactive";
  currentPeriodEnd: string | null;
  daysRemaining:    number | null;
  needsRenewal:     boolean;         // expired or expiring soon → show renew CTA
  needsAttention:   boolean;         // any state a business owner must act on
};

/**
 * Compute the business-facing status from a raw subscription row.
 * `active` + period in the future         → active
 * `active` + period ending within 7 days  → expiring  (renew now)
 * `active`/`trialing` + period passed      → expired   (renew to restore)
 * `past_due`                              → expired
 */
export function computeEffectiveSubscription(row: {
  plan_id: string; plan_name: string; status: string;
  current_period_end: string | null;
}): EffectiveSubscription {
  const end = row.current_period_end ? new Date(row.current_period_end) : null;
  const daysRemaining = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null;

  let effectiveStatus: EffectiveSubscription["effectiveStatus"] = row.status as EffectiveSubscription["effectiveStatus"];

  if ((row.status === "active" || row.status === "trialing") && end) {
    if (daysRemaining !== null && daysRemaining < 0)   effectiveStatus = "expired";
    else if (daysRemaining !== null && daysRemaining <= REMINDER_WINDOW_DAYS) effectiveStatus = "expiring";
  }
  if (row.status === "past_due") effectiveStatus = "expired";

  return {
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    effectiveStatus,
    currentPeriodEnd: row.current_period_end,
    daysRemaining,
    needsRenewal: effectiveStatus === "expired" || effectiveStatus === "expiring",
    needsAttention: ["expired", "expiring", "past_due", "cancelled", "paused"].includes(effectiveStatus),
  };
}
