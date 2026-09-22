/**
 * POST /api/subscriptions/razorpay/verify
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies a Razorpay payment after the Checkout.js modal succeeds.
 *
 * Body: {
 *   razorpay_order_id:   string;
 *   razorpay_payment_id: string;
 *   razorpay_signature:  string;
 *   orgId:               string;
 *   planId:              string;
 * }
 *
 * On success:
 *   1. Validates HMAC-SHA256 signature
 *   2. Activates the org subscription
 *   3. Logs a billing_event record
 *   4. Emails the org owner a payment-success receipt (only when this
 *      payment hasn't been processed before — the Razorpay webhook races
 *      this endpoint for the same payment and handles the email there if
 *      it arrives first, so the billing_events idempotency check prevents
 *      double-emailing).
 *
 * Returns: { ok: true; message: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { query, queryOne } from "@/lib/db";
import { verifyRazorpaySignature, PLAN_AMOUNTS_INR_PAISE, formatInr, getRazorpay } from "@/lib/razorpay";
import { appUrlFor } from "@/lib/email";
import { getOrgOwnerEmail, queueNotification } from "@/lib/subscription-notifications";
import { notifyBillingReview } from "@/lib/billing-review";

type VerifyBody = {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
  orgId:               string;
  planId:              string;
};


async function fetchRazorpayOrder(orderId: string): Promise<{ id: string; amount: number; currency: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay credentials are not configured");
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Razorpay order lookup failed: ${response.status}`);
  return response.json() as Promise<{ id: string; amount: number; currency: string }>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    const body = await req.json() as Partial<VerifyBody>;

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orgId,
      planId,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing Razorpay payment fields" }, { status: 400 });
    }
    if (!orgId || !planId) {
      return NextResponse.json({ error: "orgId and planId are required" }, { status: 400 });
    }

    // ── Verify membership ────────────────────────────────────────────────────
    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id]
    );
    if (!membership && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!auth.user.emailVerified) {
      return NextResponse.json({ error: "Verify your email before completing payment.", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
    }

    const onboarding = await queryOne<{ plan_id: string; status: string; payment_order_id: string | null }>(
      "SELECT plan_id, status, payment_order_id FROM org_subscriptions WHERE org_id = $1",
      [orgId]
    );
    if (!auth.user.isSuperAdmin && (!onboarding || onboarding.plan_id !== planId || onboarding.payment_order_id !== razorpay_order_id)) {
      return NextResponse.json({ error: "Payment does not match the current organization checkout.", code: "PAYMENT_MISMATCH" }, { status: 409 });
    }

    // ── Verify HMAC signature ────────────────────────────────────────────────
    const valid = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );
    if (!valid) {
      console.warn("[razorpay-verify] invalid signature for org", orgId);
      return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
    }

    const order = await fetchRazorpayOrder(razorpay_order_id);
    if (order.id !== razorpay_order_id || order.currency !== "INR" || Number(order.amount) !== Number(PLAN_AMOUNTS_INR_PAISE[planId])) {
      const reason = "Razorpay order amount/currency/plan mismatch";
      await query(
        "UPDATE org_subscriptions SET status = 'payment_review', payment_status = 'review', activation_review_reason = $2, updated_at = now() WHERE org_id = $1",
        [orgId, reason],
      );
      await notifyBillingReview({ orgId, planId, reason });
      return NextResponse.json({ error: "Payment requires manual verification.", code: "PAYMENT_REVIEW" }, { status: 409 });
    }

    if (order.notes?.orgId && order.notes.orgId !== orgId) {
      const reason = "Razorpay order organization mismatch";
      await query(
        "UPDATE org_subscriptions SET status = 'payment_review', payment_status = 'review', activation_review_reason = $2, updated_at = now() WHERE org_id = $1",
        [orgId, reason],
      );
      await notifyBillingReview({ orgId, planId, reason });
      return NextResponse.json({ error: "Payment requires manual verification.", code: "PAYMENT_REVIEW" }, { status: 409 });
    }

    // Record verified payment before granting entitlement. This also gives
    // the activation trigger durable evidence if activation is retried.
    const existingPayment = await queryOne(
      "SELECT id FROM billing_events WHERE event_id = $1 AND gateway = 'razorpay'",
      [razorpay_payment_id]
    );
    if (!existingPayment) {
      await query(
        `INSERT INTO billing_events
           (org_id, gateway, event_type, event_id, plan_id,
            amount_paise, currency, status, metadata)
         VALUES ($1,'razorpay','payment.captured',$2,$3,$4,'INR','paid',$5)`,
        [
          orgId, razorpay_payment_id, planId,
          PLAN_AMOUNTS_INR_PAISE[planId] ?? 0,
          JSON.stringify({ orderId: razorpay_order_id, paymentId: razorpay_payment_id }),
        ]
      );
    }

    // ── Activate subscription ────────────────────────────────────────────────
    try {
      await query(
      `INSERT INTO org_subscriptions
         (org_id, plan_id, status, gateway, razorpay_subscription_id,
          current_period_start, current_period_end)
       VALUES ($1,$2,'active','razorpay',$3, now(), now() + INTERVAL '1 month')
       ON CONFLICT (org_id) DO UPDATE SET
         plan_id                  = EXCLUDED.plan_id,
         status                   = 'active',
         gateway                  = 'razorpay',
         razorpay_subscription_id = EXCLUDED.razorpay_subscription_id,
         current_period_start     = EXCLUDED.current_period_start,
         current_period_end       = EXCLUDED.current_period_end,
         updated_at               = now()`,
      [orgId, planId, razorpay_payment_id]
      );
    } catch (activationErr) {
      const reason = `Payment verified but subscription activation failed: ${(activationErr as Error).message}`;
      await query(
        "UPDATE org_subscriptions SET status = 'payment_review', payment_status = 'review', activation_review_reason = $2, updated_at = now() WHERE org_id = $1",
        [orgId, reason],
      );
      await notifyBillingReview({ orgId, planId, reason });
      return NextResponse.json({ error: "Payment received but activation requires manual verification.", code: "PAYMENT_REVIEW" }, { status: 409 });
    }

    await query(
      "UPDATE org_subscriptions SET payment_status = 'paid', payment_verified_at = now(), pending_plan_id = NULL, activation_review_reason = NULL, updated_at = now() WHERE org_id = $1",
      [orgId],
    );

    // ── Payment success receipt ───────────────────────────────────────────────
    // The event was recorded before activation; send the receipt only when
    // this request was the first observer of the payment.
    if (!existingPayment) {
      try {
        const orgRow = await queryOne<{ org_name: string; plan_name: string }>(
          `SELECT o.name AS org_name, sp.name AS plan_name
             FROM organisations o
             JOIN subscription_plans sp ON sp.id = $2
            WHERE o.id = $1`,
          [orgId, planId]
        );
        const ownerEmail = orgRow ? await getOrgOwnerEmail(orgId) : null;
        if (orgRow && ownerEmail) {
          await queueNotification({
            orgId,
            orgName: orgRow.org_name,
            recipientEmail: ownerEmail,
            type: "payment_success",
            origin: appUrlFor("", req),
            data: {
              orgName: orgRow.org_name,
              planName: orgRow.plan_name,
              amount: formatInr(PLAN_AMOUNTS_INR_PAISE[planId] ?? 0),
              paymentId: razorpay_payment_id,
              receiptUrl: `${appUrlFor("", req)}/dashboard`,
            },
          });
        }
      } catch (mailErr) {
        console.error("[razorpay-verify] payment_success notification failed:", (mailErr as Error).message);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `${planId} plan activated successfully via Razorpay`,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/razorpay/verify]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
