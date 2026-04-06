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
 *
 * Returns: { ok: true; message: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { query, queryOne } from "@/lib/db";
import { verifyRazorpaySignature, PLAN_AMOUNTS_INR_PAISE } from "@/lib/razorpay";

type VerifyBody = {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
  orgId:               string;
  planId:              string;
};

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

    // ── Activate subscription ────────────────────────────────────────────────
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

    // ── Log billing event ────────────────────────────────────────────────────
    // Idempotency: skip if already recorded
    const existing = await queryOne(
      "SELECT id FROM billing_events WHERE event_id = $1 AND gateway = 'razorpay'",
      [razorpay_payment_id]
    );
    if (!existing) {
      await query(
        `INSERT INTO billing_events
           (org_id, gateway, event_type, event_id, plan_id,
            amount_paise, currency, status, metadata)
         VALUES ($1,'razorpay','payment.captured',$2,$3,$4,'INR','paid',$5)`,
        [
          orgId,
          razorpay_payment_id,
          planId,
          PLAN_AMOUNTS_INR_PAISE[planId] ?? 0,
          JSON.stringify({ orderId: razorpay_order_id, paymentId: razorpay_payment_id }),
        ]
      );
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
