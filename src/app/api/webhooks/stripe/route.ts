/**
 * POST /api/webhooks/stripe
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe webhook endpoint.
 *
 * Events handled:
 *   checkout.session.completed       → activate subscription after checkout
 *   customer.subscription.updated   → sync plan changes / status changes
 *   customer.subscription.deleted   → mark subscription as canceled
 *   invoice.payment_succeeded        → log paid billing event
 *   invoice.payment_failed           → mark subscription past_due
 *
 * IMPORTANT: This route must be excluded from CSRF / body-parsing middleware.
 * Next.js App Router reads the raw body via req.text() — Stripe needs the raw
 * bytes to verify the webhook signature.
 *
 * Register the webhook endpoint in Stripe Dashboard:
 *   https://dashboard.stripe.com/test/webhooks
 *   URL: https://your-domain.com/api/webhooks/stripe
 *
 * Or locally via Stripe CLI:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, queryOne } from "@/lib/db";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import type Stripe from "stripe";

// Disable default body parsing — Stripe needs raw bytes
export const config = { api: { bodyParser: false } };

// Helper: upsert org subscription from Stripe subscription object
async function syncSubscription(
  subscription: Stripe.Subscription,
  orgId?: string
): Promise<void> {
  const resolvedOrgId = orgId ?? (subscription.metadata?.orgId as string | undefined);
  if (!resolvedOrgId) {
    console.warn("[stripe-webhook] syncSubscription: no orgId in metadata", subscription.id);
    return;
  }

  const planId      = (subscription.metadata?.planId as string | undefined) ?? "free";
  const priceId     = subscription.items.data[0]?.price.id ?? null;
  const status      = mapStripeStatus(subscription.status);
  const periodStart = new Date(subscription.current_period_start * 1000);
  const periodEnd   = new Date(subscription.current_period_end   * 1000);
  const cancelAtEnd = subscription.cancel_at_period_end;
  const customerId  = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  await query(
    `INSERT INTO org_subscriptions
       (org_id, plan_id, status, stripe_customer_id, stripe_subscription_id,
        stripe_price_id, current_period_start, current_period_end,
        cancel_at_period_end, gateway)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'stripe')
     ON CONFLICT (org_id) DO UPDATE SET
       plan_id                = EXCLUDED.plan_id,
       status                 = EXCLUDED.status,
       stripe_customer_id     = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       stripe_price_id        = EXCLUDED.stripe_price_id,
       current_period_start   = EXCLUDED.current_period_start,
       current_period_end     = EXCLUDED.current_period_end,
       cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
       gateway                = 'stripe',
       updated_at             = now()`,
    [
      resolvedOrgId, planId, status, customerId, subscription.id,
      priceId, periodStart.toISOString(), periodEnd.toISOString(), cancelAtEnd,
    ]
  );
}

function mapStripeStatus(
  s: Stripe.Subscription.Status
): "active" | "trialing" | "past_due" | "canceled" {
  if (s === "trialing")  return "trialing";
  if (s === "active")    return "active";
  if (s === "past_due")  return "past_due";
  return "canceled";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  await ensureMigrated();

  const rawBody  = await req.text();
  const sigHeader = req.headers.get("stripe-signature");

  if (!sigHeader) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // ── Verify webhook signature ─────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sigHeader, getStripeWebhookSecret());
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  console.log(`[stripe-webhook] ${event.type} — ${event.id}`);

  // ── Idempotency: skip already-processed events ───────────────────────────
  const existing = await queryOne(
    "SELECT id FROM billing_events WHERE event_id = $1 AND gateway = 'stripe'",
    [event.id]
  );
  if (existing) {
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }

  // ── Event dispatch ───────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // ── Checkout completed ───────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId   = session.metadata?.orgId;
        const planId  = session.metadata?.planId ?? "free";
        const subId   = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

        if (orgId && subId) {
          const stripe = getStripe();
          const sub    = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub, orgId);
        }

        await query(
          `INSERT INTO billing_events (org_id, gateway, event_type, event_id, plan_id,
             amount_cents, currency, status, metadata)
           VALUES ($1,'stripe',$2,$3,$4,$5,'usd','paid',$6)`,
          [
            orgId ?? "unknown",
            event.type,
            event.id,
            planId,
            session.amount_total ?? 0,
            JSON.stringify({ sessionId: session.id, customerId: session.customer }),
          ]
        );
        break;
      }

      // ── Subscription updated (plan change, renewal, etc.) ────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub);

        await query(
          `INSERT INTO billing_events (org_id, gateway, event_type, event_id, plan_id,
             currency, status, metadata)
           VALUES ($1,'stripe',$2,$3,$4,'usd','paid',$5)`,
          [
            sub.metadata?.orgId ?? "unknown",
            event.type,
            event.id,
            sub.metadata?.planId ?? "unknown",
            JSON.stringify({ subscriptionId: sub.id, status: sub.status }),
          ]
        );
        break;
      }

      // ── Subscription canceled ────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub);

        await query(
          `INSERT INTO billing_events (org_id, gateway, event_type, event_id,
             currency, status, metadata)
           VALUES ($1,'stripe',$2,$3,'usd','paid',$4)`,
          [
            sub.metadata?.orgId ?? "unknown",
            event.type,
            event.id,
            JSON.stringify({ subscriptionId: sub.id }),
          ]
        );
        break;
      }

      // ── Invoice paid ─────────────────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = typeof inv.subscription === "string"
          ? inv.subscription
          : (inv.subscription as Stripe.Subscription | null)?.id;
        const orgId = (inv.subscription_details?.metadata as Record<string, string> | null)?.orgId
          ?? (inv as unknown as { metadata?: Record<string, string> }).metadata?.orgId;

        await query(
          `INSERT INTO billing_events (org_id, gateway, event_type, event_id,
             amount_cents, currency, status, metadata)
           VALUES ($1,'stripe',$2,$3,$4,'usd','paid',$5)`,
          [
            orgId ?? "unknown",
            event.type,
            event.id,
            inv.amount_paid ?? 0,
            JSON.stringify({
              invoiceId: inv.id,
              subscriptionId: subId,
              invoicePdf: inv.invoice_pdf,
            }),
          ]
        );
        break;
      }

      // ── Invoice payment failed → mark past_due ───────────────────────────
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;

        if (customerId) {
          await query(
            `UPDATE org_subscriptions SET status = 'past_due', updated_at = now()
             WHERE stripe_customer_id = $1`,
            [customerId]
          );
        }

        await query(
          `INSERT INTO billing_events (org_id, gateway, event_type, event_id,
             amount_cents, currency, status, metadata)
           VALUES ($1,'stripe',$2,$3,$4,'usd','failed',$5)`,
          [
            "unknown",
            event.type,
            event.id,
            inv.amount_due ?? 0,
            JSON.stringify({ invoiceId: inv.id, customerId }),
          ]
        );
        break;
      }

      default:
        // Silently accept unhandled event types — don't return error
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] error processing ${event.type}:`, err);
    // Return 500 so Stripe retries the event
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
