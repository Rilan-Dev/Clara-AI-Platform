/**
 * POST /api/subscriptions/checkout/verify
 * ─────────────────────────────────────────────────────────────────────────────
 * Called by /checkout/success when the customer returns from Stripe.
 *
 * Body: { sessionId: string; orgId: string }
 *
 * Retrieves the Checkout Session from Stripe and, when it is paid, activates
 * the subscription with the same code the webhook uses. This makes activation
 * independent of webhook delivery — a paid customer is never left on
 * "payment pending" because a webhook was misrouted or delayed.
 *
 * Security: the caller must be a member of the org, and the session must
 * carry that orgId in its metadata (set by POST /api/subscriptions/checkout).
 * Payment state is read from Stripe itself, never from the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { queryOne } from "@/lib/db";
import { getStripe, sanitizeStripeError } from "@/lib/stripe";
import { activateFromCheckoutSession } from "@/lib/stripe-activation";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { sessionId?: string; orgId?: string };
    const sessionId = body.sessionId?.trim() ?? "";
    const orgId = body.orgId?.trim() ?? "";

    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      return NextResponse.json({ error: "A valid Stripe checkout session id is required." }, { status: 400 });
    }
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const membership = await queryOne(
      "SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2",
      [orgId, auth.user.id],
    );
    if (!membership && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.orgId !== orgId) {
      return NextResponse.json({ error: "This checkout session belongs to a different organisation." }, { status: 403 });
    }

    const result = await activateFromCheckoutSession(stripe, session);
    console.log(`[stripe-verify] ${session.id} → ${result.outcome}`, orgId);
    return NextResponse.json({
      outcome: result.outcome,
      status: "status" in result ? result.status : null,
      paymentStatus: session.payment_status,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/checkout/verify]", sanitizeStripeError(err));
    return NextResponse.json({ error: "Could not verify the payment with Stripe." }, { status: 502 });
  }
}
