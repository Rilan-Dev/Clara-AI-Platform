/**
 * GET /api/subscriptions/portal?orgId=xxx
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a Stripe Customer Portal session so the user can:
 *   • Update payment method
 *   • Cancel or modify their subscription
 *   • View invoice history
 *
 * Requires: STRIPE_SECRET_KEY + org must have a stripe_customer_id.
 * Returns:  { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { queryOne } from "@/lib/db";
import { getStripe, appUrl } from "@/lib/stripe";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth  = await requireAuth(req);
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    // Verify membership
    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id]
    );
    if (!membership && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get Stripe customer ID
    const sub = await queryOne<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM org_subscriptions WHERE org_id = $1",
      [orgId]
    );
    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe subscription found for this organisation" },
        { status: 404 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: appUrl(`/checkout/success?orgId=${orgId}&source=portal`),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/subscriptions/portal]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
