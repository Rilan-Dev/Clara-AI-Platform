/**
 * POST   /api/subscriptions/downgrade — schedule a self-serve downgrade
 * DELETE /api/subscriptions/downgrade — cancel a pending scheduled downgrade
 * ─────────────────────────────────────────────────────────────────────────────
 * Downgrades (Pro → Starter, Pro/Starter → Free) are NEVER charged and are
 * NEVER applied immediately — the org keeps its current plan's features
 * until the current billing period ends (no refund for unused time), then
 * `sweepSubscriptionExpiry` (src/lib/subscription-expiry.ts) applies the
 * scheduled plan and clears the schedule.
 *
 * If there's no future period to honour (free plan, or the period already
 * ended), the downgrade is applied immediately instead of being scheduled.
 *
 * Upgrades are NOT handled here — they go through
 * /api/subscriptions/razorpay/order (payment required, applied immediately).
 *
 * Body (POST):   { orgId: string; planId: string }
 * Body (DELETE): { orgId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { query, queryOne } from "@/lib/db";
import { comparePlans, isSelfServePlan } from "@/lib/plans";
import { evaluateDowngradeFit } from "@/lib/plan-guard";
import { writeSubscriptionAudit, queueNotification } from "@/lib/subscription-notifications";

type SubRow = {
  plan_id: string;
  status: string;
  current_period_end: string | null;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function getOrgOwnerEmail(orgId: string): Promise<string | null> {
  try {
    const rows = await query<{ email: string }>(
      `SELECT u.email FROM users u
         JOIN org_members om ON om.user_id = u.id
         JOIN roles r ON r.id = om.role_id
        WHERE om.org_id = $1 AND r.name = 'org_admin'
        ORDER BY om.joined_at ASC LIMIT 1`,
      [orgId]
    );
    return rows[0]?.email ?? null;
  } catch {
    return null;
  }
}

async function assertMembership(req: NextRequest, orgId: string) {
  const auth = await requireAuth(req);
  const org = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM organisations WHERE id = $1",
    [orgId]
  );
  if (!org) throw NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  if (!auth.user.isSuperAdmin) {
    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id]
    );
    if (!membership) throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { auth, org };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const body = await req.json() as { orgId?: string; planId?: string };
    const { orgId, planId } = body;
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
    if (!isSelfServePlan(planId)) {
      return NextResponse.json({ error: "Invalid planId — downgrade target must be free, starter, or pro" }, { status: 400 });
    }

    const { org } = await assertMembership(req, orgId);

    const sub = await queryOne<SubRow>(
      `SELECT plan_id, status, current_period_end::text AS current_period_end
         FROM org_subscriptions WHERE org_id = $1`,
      [orgId]
    );
    const currentPlanId = sub?.plan_id ?? "free";
    const direction = comparePlans(currentPlanId, planId);

    if (direction === "upgrade") {
      return NextResponse.json(
        { error: "That's an upgrade — use the checkout flow to pay and activate it immediately." },
        { status: 400 }
      );
    }
    if (direction === "same") {
      return NextResponse.json({ error: "You're already on this plan." }, { status: 400 });
    }

    // ── Usage-fit validation — refuse a downgrade that would immediately
    //    put the org over the target plan's hard limits. ──
    const fit = await evaluateDowngradeFit(orgId, planId);
    if (!fit.ok) {
      return NextResponse.json(
        {
          error: "usage_exceeds_target_plan",
          message: `You can't downgrade to ${fit.targetPlanName} yet — usage exceeds its limits.`,
          blockers: fit.blockers,
          warnings: fit.warnings,
        },
        { status: 409 }
      );
    }

    const newPlanRow = await queryOne<{ name: string }>(`SELECT name FROM subscription_plans WHERE id=$1`, [planId]);
    const newPlanName = newPlanRow?.name ?? planId;
    const oldPlanRow = await queryOne<{ name: string }>(`SELECT name FROM subscription_plans WHERE id=$1`, [currentPlanId]);
    const oldPlanName = oldPlanRow?.name ?? currentPlanId;

    const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
    const hasFuturePeriod = !!periodEnd && periodEnd.getTime() > Date.now();

    const recipientEmail = await getOrgOwnerEmail(orgId);

    if (!hasFuturePeriod) {
      // Nothing left to honour (free plan, trial already over, or period
      // already ended) — apply immediately, same as an admin plan change.
      await query(
        `UPDATE org_subscriptions
            SET plan_id = $2, status = 'active', cancel_at_period_end = FALSE,
                scheduled_plan_id = NULL, scheduled_at = NULL, updated_at = now()
          WHERE org_id = $1`,
        [orgId, planId]
      );
      await writeSubscriptionAudit({
        orgId, actorLabel: "user", action: "downgrade_applied",
        oldPlanId: currentPlanId, newPlanId: planId,
        oldStatus: sub?.status, newStatus: "active",
        note: "Applied immediately — no active billing period to honour.",
      });
      if (recipientEmail) {
        await queueNotification({
          orgId, orgName: org.name, recipientEmail, type: "downgrade_applied",
          data: { orgName: org.name, oldPlan: oldPlanName, newPlan: newPlanName },
        });
      }
      return NextResponse.json({ ok: true, applied: "immediately", planId, warnings: fit.warnings });
    }

    // Otherwise: schedule it for the end of the current paid period.
    await query(
      `UPDATE org_subscriptions
          SET scheduled_plan_id = $2, scheduled_at = $3, updated_at = now()
        WHERE org_id = $1`,
      [orgId, planId, sub!.current_period_end]
    );
    await writeSubscriptionAudit({
      orgId, actorLabel: "user", action: "downgrade_scheduled",
      oldPlanId: currentPlanId, newPlanId: planId,
      oldStatus: sub?.status, newStatus: sub?.status,
      note: `Scheduled for ${sub!.current_period_end}`,
    });
    if (recipientEmail) {
      await queueNotification({
        orgId, orgName: org.name, recipientEmail, type: "downgrade_scheduled",
        data: { orgName: org.name, oldPlan: oldPlanName, newPlan: newPlanName, trialEnd: formatDate(sub!.current_period_end!) },
      });
    }

    return NextResponse.json({
      ok: true,
      applied: "scheduled",
      planId,
      effectiveAt: sub!.current_period_end,
      warnings: fit.warnings,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/downgrade]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const body = await req.json() as { orgId?: string };
    const { orgId } = body;
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const { org } = await assertMembership(req, orgId);

    const sub = await queryOne<SubRow & { scheduled_plan_id: string | null }>(
      `SELECT plan_id, status, current_period_end::text AS current_period_end, scheduled_plan_id
         FROM org_subscriptions WHERE org_id = $1`,
      [orgId]
    );
    if (!sub?.scheduled_plan_id) {
      return NextResponse.json({ error: "No scheduled downgrade to cancel." }, { status: 400 });
    }

    await query(
      `UPDATE org_subscriptions SET scheduled_plan_id = NULL, scheduled_at = NULL, updated_at = now() WHERE org_id = $1`,
      [orgId]
    );
    await writeSubscriptionAudit({
      orgId, actorLabel: "user", action: "downgrade_cancelled",
      oldPlanId: sub.plan_id, newPlanId: sub.plan_id,
      oldStatus: sub.status, newStatus: sub.status,
      note: `Cancelled scheduled downgrade to ${sub.scheduled_plan_id}`,
    });

    return NextResponse.json({ ok: true, orgId: org.id });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[DELETE /api/subscriptions/downgrade]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
