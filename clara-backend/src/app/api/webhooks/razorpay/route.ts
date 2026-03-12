/**
 * POST /api/webhooks/razorpay
 * ─────────────────────────────────────────────────────────────────────────────
 * Razorpay webhook endpoint.
 *
 * Events handled:
 *   payment.captured       → activate subscription
 *   payment.failed         → mark past_due
 *   subscription.charged   → log renewal
 *   subscription.cancelled → mark canceled
 *   subscription.halted    → mark past_due
 *
 * Register in Razorpay Dashboard:
 *   Settings → Webhooks → Active Webhook
 *   URL: https://your-domain.com/api/webhooks/razorpay
 *   Secret: RAZORPAY_WEBHOOK_SECRET
 *
 * Razorpay signs using HMAC-SHA256 over the raw JSON body.
 * Header: X-Razorpay-Signature
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, queryOne } from "@/lib/db";
import { verifyRazorpayWebhookSignature, PLAN_AMOUNTS_INR_PAISE } from "@/lib/razorpay";

export const config = { api: { bodyParser: false } };

// ── Type helpers ─────────────────────────────────────────────────────────────

type RzpPaymentEntity = {
  id:       string;
  order_id: string;
  amount:   number;
  currency: string;
  status:   string;
  notes:    Record<string, string>;
};

type RzpSubscriptionEntity = {
  id:     string;
  status: string;
  notes:  Record<string, string>;
};

type RzpWebhookPayload = {
  event:  string;
  payload: {
    payment?:      { entity: RzpPaymentEntity };
    subscription?: { entity: RzpSubscriptionEntity };
  };
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  await ensureMigrated();

  const rawBody  = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing X-Razorpay-Signature header" }, { status: 400 });
  }

  // Verify signature
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    console.warn("[razorpay-webhook] invalid signature");
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let payload: RzpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RzpWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { event } = payload;
  console.log(`[razorpay-webhook] ${event}`);

  try {
    switch (event) {

      // ── Payment captured (one-time checkout verify) ───────────────────────
      case "payment.captured": {
        const payment = payload.payload.payment?.entity;
        if (!payment) break;

        const orgId  = payment.notes?.orgId;
        const planId = payment.notes?.planId;
        if (!orgId || !planId) break;

        // Idempotency
        const existing = await queryOne(
          "SELECT id FROM billing_events WHERE event_id = $1 AND gateway = 'razorpay'",
          [payment.id]
        );
        if (existing) break;

        await query(
          `INSERT INTO org_subscriptions
             (org_id, plan_id, status, gateway, razorpay_subscription_id,
              current_period_start, current_period_end)
           VALUES ($1,$2,'active','razorpay',$3, now(), now() + INTERVAL '1 month')
           ON CONFLICT (org_id) DO UPDATE SET
             plan_id  = EXCLUDED.plan_id, status = 'active',
             gateway  = 'razorpay',
             razorpay_subscription_id = EXCLUDED.razorpay_subscription_id,
             current_period_start = now(),
             current_period_end   = now() + INTERVAL '1 month',
             updated_at = now()`,
          [orgId, planId, payment.id]
        );

        await query(
          `INSERT INTO billing_events
             (org_id, gateway, event_type, event_id, plan_id,
              amount_paise, currency, status, metadata)
           VALUES ($1,'razorpay',$2,$3,$4,$5,'INR','paid',$6)`,
          [
            orgId, event, payment.id, planId,
            payment.amount,
            JSON.stringify({ orderId: payment.order_id }),
          ]
        );
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case "payment.failed": {
        const payment = payload.payload.payment?.entity;
        if (!payment) break;

        const orgId  = payment.notes?.orgId;
        const planId = payment.notes?.planId;
        if (!orgId) break;

        await query(
          `UPDATE org_subscriptions SET status = 'past_due', updated_at = now()
           WHERE org_id = $1`,
          [orgId]
        );

        await query(
          `INSERT INTO billing_events
             (org_id, gateway, event_type, event_id, plan_id,
              amount_paise, currency, status, metadata)
           VALUES ($1,'razorpay',$2,$3,$4,$5,'INR','failed',$6)`,
          [
            orgId, event, payment.id, planId ?? "unknown",
            payment.amount,
            JSON.stringify({ orderId: payment.order_id }),
          ]
        );
        break;
      }

      // ── Subscription renewed ──────────────────────────────────────────────
      case "subscription.charged": {
        const sub = payload.payload.subscription?.entity;
        if (!sub) break;

        const orgId  = sub.notes?.orgId;
        const planId = sub.notes?.planId;
        if (!orgId) break;

        await query(
          `UPDATE org_subscriptions SET
             status = 'active',
             current_period_start = now(),
             current_period_end   = now() + INTERVAL '1 month',
             updated_at = now()
           WHERE org_id = $1`,
          [orgId]
        );

        await query(
          `INSERT INTO billing_events
             (org_id, gateway, event_type, event_id, plan_id,
              amount_paise, currency, status, metadata)
           VALUES ($1,'razorpay',$2,$3,$4,$5,'INR','paid',$6)`,
          [
            orgId, event, sub.id, planId ?? "unknown",
            PLAN_AMOUNTS_INR_PAISE[planId ?? ""] ?? 0,
            JSON.stringify({ subscriptionId: sub.id }),
          ]
        );
        break;
      }

      // ── Subscription cancelled ────────────────────────────────────────────
      case "subscription.cancelled": {
        const sub = payload.payload.subscription?.entity;
        if (!sub) break;
        const orgId = sub.notes?.orgId;
        if (!orgId) break;

        await query(
          `UPDATE org_subscriptions SET status = 'canceled', updated_at = now()
           WHERE org_id = $1`,
          [orgId]
        );
        break;
      }

      // ── Subscription halted (payment attempts exhausted) ──────────────────
      case "subscription.halted": {
        const sub = payload.payload.subscription?.entity;
        if (!sub) break;
        const orgId = sub.notes?.orgId;
        if (!orgId) break;

        await query(
          `UPDATE org_subscriptions SET status = 'past_due', updated_at = now()
           WHERE org_id = $1`,
          [orgId]
        );
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[razorpay-webhook] error processing ${event}:`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
