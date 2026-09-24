/**
 * src/lib/stripe-activation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Turning a paid Stripe Checkout Session into an active subscription.
 *
 * Shared by two callers so they can never disagree:
 *   1. POST /api/webhooks/stripe            (checkout.session.completed)
 *   2. POST /api/subscriptions/checkout/verify (the success page, on return)
 *
 * The success-page path exists because relying on the webhook alone leaves
 * a paid customer stuck on "payment pending" whenever the webhook is not
 * delivered (endpoint registered for another domain, wrong signing secret,
 * Stripe outage, firewall). Stripe recommends verifying the session on
 * return as well; both paths are idempotent.
 *
 * Also tolerant of newer Stripe API versions: webhook payloads use the API
 * version the endpoint was created with in the Stripe dashboard, not the SDK
 * pin, and since 2025-03-31 the billing period lives on subscription items
 * and an invoice's subscription lives under `parent.subscription_details`.
 */

import type Stripe from "stripe";
import { query, queryOne } from "@/lib/db";

export type ActivationResult =
  | { outcome: "activated"; status: string }
  | { outcome: "not_paid"; status: string }
  | { outcome: "skipped"; reason: string };

type AnySubscription = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
  items: { data: Array<Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }> };
};

/** Billing period for any API version (top-level before 2025-03-31, per item after). */
export function subscriptionPeriod(sub: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const s = sub as AnySubscription;
  const item = s.items?.data?.[0];
  const start = s.current_period_start ?? item?.current_period_start;
  const end = s.current_period_end ?? item?.current_period_end;
  return {
    start: typeof start === "number" ? new Date(start * 1000) : null,
    end: typeof end === "number" ? new Date(end * 1000) : null,
  };
}

type AnyInvoice = Stripe.Invoice & {
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null; metadata?: Record<string, string> | null } | null;
  } | null;
};

/** Subscription id of an invoice for any API version. */
export function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const i = inv as AnyInvoice;
  const legacy = (i as { subscription?: string | { id: string } | null }).subscription;
  const modern = i.parent?.subscription_details?.subscription;
  const value = legacy ?? modern ?? null;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** orgId stamped on the subscription metadata, for any API version. */
export function invoiceOrgId(inv: Stripe.Invoice): string | null {
  const i = inv as AnyInvoice;
  const legacyDetails = (i as { subscription_details?: { metadata?: Record<string, string> | null } | null }).subscription_details;
  return (
    legacyDetails?.metadata?.orgId ??
    i.parent?.subscription_details?.metadata?.orgId ??
    (i.metadata as Record<string, string> | null)?.orgId ??
    null
  );
}

function mapStripeStatus(s: Stripe.Subscription.Status): "active" | "trialing" | "past_due" | "canceled" {
  if (s === "trialing") return "trialing";
  if (s === "active") return "active";
  if (s === "past_due") return "past_due";
  return "canceled";
}

/** Upsert org_subscriptions from a Stripe subscription object. */
export async function syncSubscription(
  subscription: Stripe.Subscription,
  orgId?: string,
  paymentConfirmed = false,
): Promise<string | null> {
  const resolvedOrgId = orgId ?? (subscription.metadata?.orgId as string | undefined);
  if (!resolvedOrgId) {
    console.warn("[stripe] syncSubscription: no orgId in metadata", subscription.id);
    return null;
  }

  const planId = (subscription.metadata?.planId as string | undefined) ?? "free";
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const status = mapStripeStatus(subscription.status);
  const owner = await queryOne<{ email_verified: boolean }>(
    `SELECT u.email_verified
       FROM org_members om
       JOIN users u ON u.id = om.user_id
       JOIN roles r ON r.id = om.role_id
      WHERE om.org_id = $1 AND r.name = 'org_admin'
      LIMIT 1`,
    [resolvedOrgId],
  );
  const paidEvidence = planId === "free" ? true : !!await queryOne<{ id: string }>(
    `SELECT id FROM billing_events
       WHERE org_id = $1 AND plan_id = $2 AND status = 'paid'
         AND event_type IN ('invoice.payment_succeeded','invoice.paid','payment_intent.succeeded','checkout.session.completed')
       LIMIT 1`,
    [resolvedOrgId, planId],
  );
  const effectiveStatus = !owner?.email_verified && status === "active"
    ? "pending_email"
    : (status === "active" && !(paymentConfirmed || paidEvidence) ? "payment_pending" : status);
  const { start, end } = subscriptionPeriod(subscription);
  const customerId = typeof subscription.customer === "string"
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
       current_period_start   = COALESCE(EXCLUDED.current_period_start, org_subscriptions.current_period_start),
       current_period_end     = COALESCE(EXCLUDED.current_period_end, org_subscriptions.current_period_end),
       cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
       gateway                = 'stripe',
       updated_at             = now()`,
    [
      resolvedOrgId, planId, effectiveStatus, customerId, subscription.id,
      priceId, start?.toISOString() ?? null, end?.toISOString() ?? null, subscription.cancel_at_period_end,
    ],
  );
  return effectiveStatus;
}

/**
 * Activate the org behind a completed Checkout Session. Idempotent: running
 * it again for the same session (webhook + success page) is harmless.
 */
export async function activateFromCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<ActivationResult> {
  const orgId = session.metadata?.orgId;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!orgId) return { outcome: "skipped", reason: "Checkout session has no orgId metadata." };
  if (!subId) return { outcome: "skipped", reason: "Checkout session has no subscription." };

  const paid = session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required");

  if (!paid) {
    await query(
      `UPDATE org_subscriptions
          SET status = 'payment_pending', payment_status = 'pending', payment_session_id = $2, updated_at = now()
        WHERE org_id = $1 AND payment_status IS DISTINCT FROM 'paid'`,
      [orgId, session.id],
    );
    return { outcome: "not_paid", status: "payment_pending" };
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  const status = (await syncSubscription(sub, orgId, true)) ?? "active";
  await query(
    `UPDATE org_subscriptions
        SET payment_status = 'paid', payment_verified_at = COALESCE(payment_verified_at, now()),
            pending_plan_id = NULL, payment_session_id = $2, activation_review_reason = NULL,
            updated_at = now()
      WHERE org_id = $1`,
    [orgId, session.id],
  );
  return { outcome: "activated", status };
}
