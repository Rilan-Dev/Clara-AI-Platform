/**
 * POST /api/subscriptions/razorpay/order
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a Razorpay Order for the given org + plan (INR pricing).
 *
 * Body: { orgId: string; planId: "starter" | "pro" }
 *
 * Returns: {
 *   orderId:   string;       // Razorpay order_id (rzp_…)
 *   amount:    number;       // amount in paise
 *   currency:  "INR";
 *   keyId:     string;       // NEXT_PUBLIC_RAZORPAY_KEY_ID (safe for browser)
 *   orgId:     string;
 *   planId:    string;
 *   planName:  string;
 *   amountInr: number;       // human-readable ₹ amount
 * }
 *
 * The browser then calls Razorpay Checkout.js with this data.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { queryOne, query } from "@/lib/db";
import {
  getRazorpay,
  PLAN_AMOUNTS_INR_PAISE,
  PLAN_AMOUNTS_INR,
  PLAN_NAMES_INR,
} from "@/lib/razorpay";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const auth = await requireAuth(req);
    const body = await req.json() as { orgId?: string; planId?: string };
    const { orgId, planId } = body;

    if (!orgId)  return NextResponse.json({ error: "orgId is required" },  { status: 400 });
    if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });
    if (!["starter", "pro"].includes(planId)) {
      return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
    }

    // Verify org + membership
    const org = await queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM organisations WHERE id = $1",
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

    const amountPaise = PLAN_AMOUNTS_INR_PAISE[planId];
    if (!amountPaise) {
      return NextResponse.json({ error: "Plan pricing not configured" }, { status: 500 });
    }

    const razorpay = getRazorpay();

    // Idempotency: generate a unique receipt per org+plan+timestamp
    const receipt = `clara-${orgId.slice(0, 8)}-${planId}-${Date.now()}`;

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt,
      notes: {
        orgId,
        planId,
        userId: auth.user.id,
        orgName: org.name,
      },
    });

    // Mark the org as using razorpay gateway (pre-flight)
    await query(
      `INSERT INTO org_subscriptions (org_id, plan_id, status, gateway)
       VALUES ($1, $2, 'trialing', 'razorpay')
       ON CONFLICT (org_id) DO UPDATE SET
         gateway    = 'razorpay',
         updated_at = now()`,
      [orgId, planId]
    );

    return NextResponse.json({
      orderId:   order.id,
      amount:    order.amount,
      currency:  "INR",
      keyId:     process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "",
      orgId,
      planId,
      planName:  PLAN_NAMES_INR[planId] ?? planId,
      amountInr: PLAN_AMOUNTS_INR[planId] ?? 0,
      userEmail: auth.user.email,
      userName:  auth.user.fullName,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/subscriptions/razorpay/order]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
