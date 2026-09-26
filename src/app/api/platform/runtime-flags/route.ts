import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { describeRuntimeFlags, type RuntimeFlagGroup } from "@/lib/runtime-flags";
import { queryOne } from "@/lib/db";
import { resolvePublicOrigin } from "@/lib/public-origin";

/** Payment webhooks are the usual reason a paid customer stays "pending". */
async function paymentWebhookGroup(req: NextRequest): Promise<RuntimeFlagGroup> {
  const origin = resolvePublicOrigin(req);
  const last = await queryOne<{ stripe_at: string | null; razorpay_at: string | null }>(
    `SELECT MAX(created_at) FILTER (WHERE gateway = 'stripe')::text   AS stripe_at,
            MAX(created_at) FILTER (WHERE gateway = 'razorpay')::text AS razorpay_at
       FROM billing_events`,
  ).catch(() => null);
  const stripeKey = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const stripeSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return {
    id: "payments",
    title: "Payment webhooks",
    flags: [
      {
        key: "STRIPE_WEBHOOK_URL",
        label: "Stripe webhook endpoint to register",
        value: `${origin}/api/webhooks/stripe`,
        isDefault: false,
        note: "Register this exact URL in Stripe → Developers → Webhooks (test and live mode separately).",
      },
      {
        key: "STRIPE_WEBHOOK_LAST_RECEIVED",
        label: "Last Stripe webhook received",
        value: last?.stripe_at ?? "Never",
        isDefault: false,
        note: stripeKey && !last?.stripe_at
          ? "No Stripe webhook has ever reached this server. Paid checkouts still activate when the customer returns to the success page."
          : undefined,
        attention: stripeKey && !last?.stripe_at,
      },
      {
        key: "STRIPE_WEBHOOK_SECRET",
        label: "Stripe webhook signing secret",
        value: stripeSecret ? "Configured" : "Not configured",
        isDefault: !stripeSecret,
        attention: stripeKey && !stripeSecret,
        note: stripeKey && !stripeSecret ? "Webhooks will be rejected until the whsec_… secret is set in Settings → Payments." : undefined,
      },
      {
        key: "NEXT_PUBLIC_APP_URL",
        label: "Public application URL",
        value: appUrl || `(not set — using ${origin})`,
        isDefault: !appUrl,
        attention: Boolean(appUrl && appUrl !== origin),
        note: appUrl && appUrl !== origin
          ? `Differs from the address you are using (${origin}). Stripe redirects and emailed links use ${appUrl}.`
          : undefined,
      },
      { key: "RAZORPAY_WEBHOOK_LAST_RECEIVED", label: "Last Razorpay webhook received", value: last?.razorpay_at ?? "Never", isDefault: false },
    ],
  };
}

/** GET /api/platform/runtime-flags — read-only effective env switches (super admin). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    return NextResponse.json({ groups: [await paymentWebhookGroup(req), ...describeRuntimeFlags()] });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
