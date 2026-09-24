/**
 * POST /api/webhooks/stripe
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe webhook endpoint.
 *
 * Events handled:
 *   checkout.session.completed       → activate subscription after checkout
 *   customer.subscription.updated   → sync plan changes / status changes
 *   customer.subscription.deleted   → mark subscription as canceled
 *   invoice.payment_succeeded        → log paid billing event + email the org
 *                                       owner a receipt (payment_success)
 *   invoice.payment_failed           → mark subscription past_due + email the
 *                                       org owner (payment_failed template)
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
import { getStripe, getStripeWebhookSecret, sanitizeStripeError } from "@/lib/stripe";
import { syncPlatformHealthIncidents } from "@/modules/platform-health/core/incidents";
import { appUrlFor } from "@/lib/email";
import { getOrgOwnerEmail, queueNotification } from "@/lib/subscription-notifications";
import type Stripe from "stripe";
import {
  activateFromCheckoutSession,
  invoiceOrgId,
  invoiceSubscriptionId,
  syncSubscription,
} from "@/lib/stripe-activation";

// Disable default body parsing — Stripe needs raw bytes
export const config = { api: { bodyParser: false } };

// ── Payment receipt email ─────────────────────────────────────────────────
// Shared by invoice.payment_succeeded (first purchase + every renewal).
// Wrapped so an email failure never fails the webhook — a 500 would make
// Stripe retry the whole event, but billing_events already recorded it and
// the retry would be deduped, skipping this notification.

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendPaymentSuccessEmail(orgId: string, inv: Stripe.Invoice, origin?: string): Promise<void> {
  try {
    const orgRow = await queryOne<{ org_name: string; plan_name: string }>(
      `SELECT o.name AS org_name, sp.name AS plan_name
         FROM organisations o
         JOIN org_subscriptions os ON os.org_id = o.id
         JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE o.id = $1`,
      [orgId]
    );
    if (!orgRow) return;

    const ownerEmail = await getOrgOwnerEmail(orgId);
    if (!ownerEmail) return;

    await queueNotification({
      orgId,
      orgName: orgRow.org_name,
      recipientEmail: ownerEmail,
      type: "payment_success",
      origin,
      data: {
        orgName: orgRow.org_name,
        planName: orgRow.plan_name,
        amount: formatUsd(inv.amount_paid ?? 0),
        paymentId: inv.id ?? inv.number ?? "stripe-invoice",
        receiptUrl: inv.hosted_invoice_url ?? `${origin ?? appUrlFor("")}/dashboard`,
      },
    });
  } catch (mailErr) {
    console.error("[stripe-webhook] payment_success notification failed:", (mailErr as Error).message);
  }
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
    await syncPlatformHealthIncidents([{
      key: "stripe-webhook",
      serviceName: "Stripe webhook",
      healthy: false,
      severity: "critical",
      message: `Stripe webhook signature verification failed: ${sanitizeStripeError(err)}`,
    }]);
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

        // Same activation the success page runs on return — whichever
        // arrives first activates the org; the other is a no-op.
        const result = await activateFromCheckoutSession(getStripe(), session);
        console.log(`[stripe-webhook] checkout ${session.id} → ${result.outcome}`, orgId ?? "");

        await query(
          `INSERT INTO billing_events (org_id, gateway, event_type, event_id, plan_id,
             amount_cents, currency, status, metadata)
           VALUES ($1,'stripe',$2,$3,$4,$5,'usd',$7,$6)`,
          [
            orgId ?? "unknown",
            event.type,
            event.id,
            planId,
            session.amount_total ?? 0,
            JSON.stringify({ sessionId: session.id, customerId: session.customer }),
            // Only a paid session is payment evidence for syncSubscription.
            result.outcome === "activated" ? "paid" : "pending",
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

      // ── Invoice paid → billing event + owner receipt email ────────────────
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = invoiceSubscriptionId(inv);
        const orgId = invoiceOrgId(inv);

        if (orgId && orgId !== "unknown") {
          await query(
            `UPDATE org_subscriptions
                SET status = 'active', payment_status = 'paid',
                    payment_verified_at = now(), pending_plan_id = NULL,
                    activation_review_reason = NULL, updated_at = now()
              WHERE org_id = $1 AND status IN ('payment_pending','payment_required','payment_failed','payment_cancelled','pending_email')`,
            [orgId],
          );
        }

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

        // Receipt email to the org owner — covers the first purchase AND
        // every renewal. checkout.session.completed deliberately stays
        // email-free: Stripe fires BOTH events for the first payment, so
        // sending there too would double-email every new customer.
        if (orgId && orgId !== "unknown") {
          await sendPaymentSuccessEmail(orgId, inv, appUrlFor("", req));
        }
        break;
      }

      // ── Invoice payment failed → past_due + owner email ───────────────────
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;

        // Resolve the org behind the failed payment so the owner can be
        // notified (falls back to "unknown" for unmatched customers).
        const subRow = customerId
          ? await queryOne<{ org_id: string; org_name: string; plan_name: string }>(
              `SELECT os.org_id, o.name AS org_name, sp.name AS plan_name
                 FROM org_subscriptions os
                 JOIN organisations o ON o.id = os.org_id
                 JOIN subscription_plans sp ON sp.id = os.plan_id
                WHERE os.stripe_customer_id = $1`,
              [customerId]
            )
          : null;

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
            subRow?.org_id ?? "unknown",
            event.type,
            event.id,
            inv.amount_due ?? 0,
            JSON.stringify({ invoiceId: inv.id, customerId }),
          ]
        );

        // Notify the org owner via the editable payment_failed template.
        // Wrapped so an email failure never fails the webhook (a 500 would
        // make Stripe retry the whole event — but billing_events above
        // already recorded it, so the retry would be deduped and skip this
        // notification).
        if (subRow) {
          try {
            const ownerEmail = await getOrgOwnerEmail(subRow.org_id);
            if (ownerEmail) {
              await queueNotification({
                orgId: subRow.org_id,
                orgName: subRow.org_name,
                recipientEmail: ownerEmail,
                type: "payment_failed",
                origin: appUrlFor("", req),
                data: { orgName: subRow.org_name, planName: subRow.plan_name },
              });
            }
          } catch (mailErr) {
            console.error("[stripe-webhook] payment_failed notification failed:", (mailErr as Error).message);
          }
        }
        break;
      }

      default:
        // Silently accept unhandled event types — don't return error
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] error processing ${event.type}:`, err);
    await syncPlatformHealthIncidents([{
      key: "stripe-webhook-processing",
      serviceName: "Stripe webhook processing",
      healthy: false,
      severity: "critical",
      message: `Stripe webhook processing failed for ${event.type}: ${sanitizeStripeError(err)}`,
    }]);
    // Return 500 so Stripe retries the event
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
