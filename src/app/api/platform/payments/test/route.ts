/**
 * POST /api/platform/payments/test
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the configured payment-gateway credentials with a live call to
 * the gateway, so operators catch typos before a customer does.
 *
 * Body: { gateway: "stripe" | "razorpay" }
 *
 * Stripe:   retrieves the account balance (a cheap authenticated read).
 * Razorpay: lists one payment over the REST API (a cheap authenticated
 *           read — the SDK typings do not expose payments.all, so the raw
 *           endpoint is used).
 *
 * The response also reports the detected mode (test / live) from the key
 * prefix — the admin panel cannot see secret prefixes (masked), so this is
 * the authoritative mode signal for the status badge.
 *
 * Super-admin only (same guard as the env settings route).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getStripe, sanitizeStripeError } from "@/lib/stripe";

function sanitize(message: string): string {
  return sanitizeStripeError(message).replace(/rzp_(?:test|live)_[A-Za-z0-9]+/g, "rzp_***");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = (await req.json().catch(() => ({}))) as { gateway?: string };

    if (body.gateway === "stripe") {
      const stripe = getStripe(); // throws a clear error when unconfigured
      await stripe.balance.retrieve();
      const mode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") ? "live" : "test";
      return NextResponse.json({
        ok: true,
        gateway: "stripe",
        mode,
        detail: `Stripe ${mode} credentials are valid and reachable.`,
      });
    }

    if (body.gateway === "razorpay") {
      const keyId = process.env.RAZORPAY_KEY_ID ?? "";
      const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
      if (!keyId || !keySecret) {
        throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured.");
      }
      const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(
          `Razorpay rejected the credentials (HTTP ${res.status})${errBody ? ` — ${errBody.slice(0, 180)}` : ""}`,
        );
      }
      const mode = keyId.startsWith("rzp_live_") ? "live" : "test";
      return NextResponse.json({
        ok: true,
        gateway: "razorpay",
        mode,
        detail: `Razorpay ${mode} credentials are valid and reachable.`,
      });
    }

    return NextResponse.json(
      { ok: false, error: "gateway must be 'stripe' or 'razorpay'." },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: sanitize(message) },
      { status: 502 },
    );
  }
}
