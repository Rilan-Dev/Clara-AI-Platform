/**
 * POST /api/webhooks/razorpay
 * ─────────────────────────────────────────────────────────────────────────────
 * Razorpay webhook endpoint.
 *
 * Events handled:
 *   payment.captured       → activate subscription + owner receipt email
 *   payment.failed         → mark past_due + owner payment_failed email
 *   subscription.charged   → log renewal + owner receipt email
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
import { verifyRazorpayWebhookSignature, PLAN_AMOUNTS_INR_PAISE, formatInr } from "@/lib/razorpay";
import { appUrlFor } from "@/lib/email";
import { getOrgOwnerEmail, queueNotification } from "@/lib/subscription-notifications";

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

// ── Org owner notification helpers ─────────────────────────────────────────

async function orgInfoFor(orgId: string, planId: string): Promise<{ orgName: string; planName: string } | null> {
  const row = await queryOne<{ org_name: string; plan_name: string }>(
    `SELECT o.name AS org_name, sp.name AS plan_name
       FROM organisations o
       JOIN subscription_plans sp ON sp.id = $2
      WHERE o.id = $1`,
    [orgId, planId]
  );
  return row ? { orgName: row.org_name, planName: row.plan_name } : null;
}

/** Payment receipt (payment_success) — first purchase and renewals. */
async function notifyPaymentSuccess(
  orgId: string, planId: string, amountPaise: number, paymentId: string,
  origin?: string
): Promise<void> {
  try {
    const info = await orgInfoFor(orgId, planId);
    if (!info) return;
    const ownerEmail = await getOrgOwnerEmail(orgId);
    if (!ownerEmail) return;
    await queueNotification({
      orgId,
      orgName: info.orgName,
      recipientEmail: ownerEmail,
      type: "payment_success",
      origin,
      data: {
        orgName: info.orgName,
        planName: info.planName,
        amount: formatInr(amountPaise),
        paymentId,
        // Absolute URL — a relative href is unusable inside email clients.
        receiptUrl: `${origin ?? appUrlFor("")}/dashboard`,
      },
    });
  } catch (mailErr) {
    console.error("[razorpay-webhook] payment_success notification failed:", (mailErr as Error).message);
  }
}

/** Payment failure alert (payment_failed) — parity with the Stripe webhook. */
async function notifyPaymentFailed(orgId: string, planId: string, origin?: string): Promise<void> {
  try {
    const info = await orgInfoFor(orgId, planId);
    if (!info) return;
    const ownerEmail = await getOrgOwnerEmail(orgId);
    if (!ownerEmail) return;
    await queueNotification({
      orgId,
      orgName: info.orgName,
      recipientEmail: ownerEmail,
      type: "payment_failed",
      origin,
      data: { orgName: info.orgName, planName: info.planName },
    });
  } catch (mailErr) {
    console.error("[razorpay-webhook] payment_failed notification failed:", (mailErr as Error).message);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────────

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

        const owner = await queryOne<{ email_verified: boolean; user_id: string }>(
          `SELECT u.email_verified, u.id AS user_id
             FROM org_members om
             JOIN users u ON u.id = om.user_id
             JOIN roles r ON r.id = om.role_id
            WHERE om.org_id = $1 AND r.name = 'org_admin'
            LIMIT 1`,
          [orgId],
        );
        if (!owner?.email_verified) {
          await query(
            "UPDATE org_subscriptions SET status = 'payment_review', payment_status = 'review', activation_review_reason = $2, updated_at = now() WHERE org_id = $1",
            [orgId, "Payment captured before email verification; manual reconciliation required"],
          );
          break;
        }

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
             payment_status = 'paid',
             payment_verified_at = now(),
             pending_plan_id = NULL,
             activation_review_reason = NULL,
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

        // Owner receipt email. The client-side /verify endpoint races this
        // webhook for the same payment; whichever records billing_events
        // first sends the email, the other side's idempotency check skips
        // it — one receipt per payment, never two.
        await notifyPaymentSuccess(orgId, planId, payment.amount, payment.id, appUrlFor("", req));
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

        // Notify the org owner via the editable payment_failed template —
        // previously only the Stripe webhook emailed failures; Razorpay
        // orgs silently went past_due.
        if (planId) {
          await notifyPaymentFailed(orgId, planId, appUrlFor("", req));
        }
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

        // Renewal receipt for the org owner.
        if (planId) {
          await notifyPaymentSuccess(
            orgId, planId, PLAN_AMOUNTS_INR_PAISE[planId] ?? 0, sub.id, appUrlFor("", req)
          );
        }
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
