/**
 * POST /api/subscriptions/checkout
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a Stripe Checkout Session for the given org + plan.
 *
 * Body: { orgId: string; planId: "starter" | "pro" }
 *
 * Returns: { url: string } — redirect to Stripe-hosted checkout page.
 *
 * After payment Stripe redirects to:
 *   /checkout/success?session_id={CHECKOUT_SESSION_ID}&orgId=…&plan=…
 *
 * Security: requires valid session token (org_admin only in production;
 * for now we accept any authenticated user until RBAC is wired to billing).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { queryOne, query } from "@/lib/db";
import {
  getStripe,
  getStripePriceId,
  PLAN_AMOUNTS_CENTS,
  PLAN_NAMES,
  appUrl,
} from "@/lib/stripe";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = await requireAuth(req);

    if (!auth.user.emailVerified) {
      return NextResponse.json({ error: "Verify your email before starting payment.", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
    }
    const body = await req.json() as { orgId?: string; planId?: string };
    const { orgId, planId } = body;

    if (!orgId)  return NextResponse.json({ error: "orgId is required" },  { status: 400 });
    if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
    if (!["starter", "pro"].includes(planId)) {
      return NextResponse.json({ error: "Invalid planId — must be starter or pro" }, { status: 400 });
    }

    // ── Verify org exists + user is a member ────────────────────────────────
    const org = await queryOne<{ id: string; name: string; slug: string }>(
      "SELECT id, name, slug FROM organisations WHERE id = $1",
      [orgId]
    );
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id]
    );
    if (!membership && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const onboarding = await queryOne<{ plan_id: string; status: string }>(
      "SELECT plan_id, status FROM org_subscriptions WHERE org_id = $1", [orgId]
    );
    if (!auth.user.isSuperAdmin && (!onboarding || onboarding.plan_id !== planId || !["payment_required","payment_pending","payment_failed","payment_cancelled"].includes(onboarding.status))) {
      return NextResponse.json({ error: "This organization is not eligible for payment for the selected plan.", code: "PAYMENT_NOT_ELIGIBLE" }, { status: 409 });
    }

    const stripe = getStripe();

    // ── Resolve or create Stripe Customer ───────────────────────────────────
    const sub = await queryOne<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM org_subscriptions WHERE org_id = $1",
      [orgId]
    );

    let customerId: string | undefined = sub?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    auth.user.email,
        name:     auth.user.fullName,
        metadata: { orgId, orgSlug: org.slug, userId: auth.user.id },
      });
      customerId = customer.id;

      // Persist customer ID so we can reuse it
      await query(
        `INSERT INTO org_subscriptions (org_id, plan_id, status, stripe_customer_id, gateway)
         VALUES ($1, $2, 'trialing', $3, 'stripe')
         ON CONFLICT (org_id) DO UPDATE SET
           stripe_customer_id = EXCLUDED.stripe_customer_id,
           gateway = 'stripe',
           updated_at = now()`,
        [orgId, planId, customerId]
      );
    }

    // ── Build line items ────────────────────────────────────────────────────
    const priceId = getStripePriceId(planId);

    // If a Stripe Price ID is configured, use it (proper recurring subscription).
    // Fallback: create a one-time price on the fly (useful for test mode without
    // pre-configured prices in Dashboard).
    const lineItems: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency:     "usd",
            unit_amount:  PLAN_AMOUNTS_CENTS[planId]!,
            product_data: { name: PLAN_NAMES[planId] ?? planId },
            recurring:    { interval: "month" },
          },
          quantity: 1,
        }];

    // ── Create Checkout Session ─────────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode:        "subscription",
      customer:    customerId,
      line_items:  lineItems,
      success_url: appUrl(
        `/checkout/success?session_id={CHECKOUT_SESSION_ID}&orgId=${orgId}&plan=${planId}`
      ),
      cancel_url: appUrl(`/checkout?plan=${planId}&orgId=${orgId}&cancelled=1`),
      metadata:   { orgId, planId, userId: auth.user.id },
      subscription_data: {
        metadata: { orgId, planId },
      },
      allow_promotion_codes: true,
    });

    await query(
      `UPDATE org_subscriptions
          SET plan_id = $2, pending_plan_id = $2, status = 'payment_pending',
              payment_status = 'pending', payment_session_id = $3,
              gateway = 'stripe', updated_at = now()
        WHERE org_id = $1`,
      [orgId, planId, session.id]
    );

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/checkout]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
