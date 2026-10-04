/**
 * POST /api/subscriptions/razorpay/order
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a Razorpay Order for the given org + plan (INR pricing).
 *
 * Body: { orgId: string; planId: "starter" | "pro" }
 *
 * Returns: {
 *   orderId:   string;       // Razorpay order_id (rzp_…)
 *   amount:    number;       // amount in paise
 *   currency:  "INR";
 *   keyId:     string;       // NEXT_PUBLIC_RAZORPAY_KEY_ID (safe for browser)
 *   orgId:     string;
 *   planId:    string;
 *   planName:  string;
 *   amountInr: number;       // human-readable ₹ amount
 * }
 *
 * The browser then calls Razorpay Checkout.js with this data.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { queryOne, query } from "@/lib/db";
import { comparePlans } from "@/lib/plans";
import {
  getRazorpay,
  PLAN_AMOUNTS_INR_PAISE,
  PLAN_AMOUNTS_INR,
  PLAN_NAMES_INR,
} from "@/lib/razorpay";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);

    if (!auth.user.emailVerified) {
      return NextResponse.json({ error: "Verify your email before starting payment.", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
    }
    const body = await req.json() as { orgId?: string; planId?: string };
    const { orgId, planId } = body;

    if (!orgId)  return NextResponse.json({ error: "orgId is required" },  { status: 400 });
    if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
    if (!["starter", "pro"].includes(planId)) {
      return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
    }

    // Verify org + membership
    const org = await queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM organisations WHERE id = $1",
      [orgId]
    );
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

    if (!auth.user.isSuperAdmin) await requireOrgPermission(auth, orgId, "org:update");

    const onboarding = await queryOne<{ plan_id: string; status: string }>(
      "SELECT plan_id, status FROM org_subscriptions WHERE org_id = $1", [orgId]
    );
    if (!auth.user.isSuperAdmin && (!onboarding || onboarding.plan_id !== planId || !["payment_required","payment_pending","payment_failed","payment_cancelled"].includes(onboarding.status))) {
      return NextResponse.json({ error: "This organization is not eligible for payment for the selected plan.", code: "PAYMENT_NOT_ELIGIBLE" }, { status: 409 });
    }

    // Guard against charging for a downgrade — a crafted request must not be
    // able to pay Razorpay for a lower plan than the org already has.
    // Downgrades are always free and go through /api/subscriptions/downgrade.
    const currentSub = await queryOne<{
      plan_id: string;
      status: string;
      payment_status: string;
      current_period_end: string | null;
    }>(
      "SELECT plan_id, status, payment_status, current_period_end::text AS current_period_end FROM org_subscriptions WHERE org_id = $1",
      [orgId]
    );
    const currentPlanId = currentSub?.plan_id ?? "free";
    const direction = comparePlans(currentPlanId, planId);
    if (direction === "downgrade") {
      return NextResponse.json(
        { error: "That's a downgrade — use POST /api/subscriptions/downgrade instead (no payment required)." },
        { status: 400 }
      );
    }
    if (direction === "same") {
      const periodEnd = currentSub?.current_period_end ? new Date(currentSub.current_period_end) : null;
      const stillActive = currentSub?.payment_status === "paid"
        && !!periodEnd
        && periodEnd.getTime() > Date.now()
        && currentSub?.status !== "past_due"
        && currentSub?.status !== "cancelled";
      if (stillActive) {
        return NextResponse.json({ error: "You're already on this plan and it's still active." }, { status: 400 });
      }
      // An unpaid onboarding row is intentionally allowed through even if an
      // old/stale current_period_end makes the subscription look active.
      // Payment status, not a period date alone, determines whether the
      // customer has already paid for this plan.
      // Expired/past_due same-plan renewal is also allowed to fall through.
    }

    const amountPaise = PLAN_AMOUNTS_INR_PAISE[planId];
    if (!amountPaise) {
      return NextResponse.json({ error: "Plan pricing not configured" }, { status: 500 });
    }

    const razorpay = getRazorpay();

    // Idempotency: generate a unique receipt per org+plan+timestamp
    const receipt = `clara-${orgId.slice(0, 8)}-${planId}-${Date.now()}`;

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt,
      notes: {
        orgId,
        planId,
        userId: auth.user.id,
        orgName: org.name,
      },
    });

    await query(
      `UPDATE org_subscriptions
          SET plan_id = $2, pending_plan_id = $2, status = 'payment_pending',
              payment_status = 'pending', payment_order_id = $3,
              gateway = 'razorpay', updated_at = now()
        WHERE org_id = $1`,
      [orgId, planId, order.id]
    );

    return NextResponse.json({
      orderId:   order.id,
      amount:    order.amount,
      currency:  "INR",
      keyId:     process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "",
      orgId,
      planId,
      planName:  PLAN_NAMES_INR[planId] ?? planId,
      amountInr: PLAN_AMOUNTS_INR[planId] ?? 0,
      userEmail: auth.user.email,
      userName:  auth.user.fullName,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/razorpay/order]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
