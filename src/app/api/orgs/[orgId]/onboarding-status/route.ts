import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireAuth } from "@/modules/auth/core/rbac";
import { getOrgMembership } from "@/modules/auth/core/db";

type OnboardingState =
  | "ready"
  | "email_verification_required"
  | "payment_required"
  | "payment_pending"
  | "payment_failed"
  | "payment_cancelled"
  | "payment_review"
  | "subscription_required";

const PAYMENT_STATES = new Set([
  "payment_required",
  "payment_pending",
  "payment_failed",
  "payment_cancelled",
  "payment_review",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) {
      return NextResponse.json({ state: "ready" satisfies OnboardingState });
    }

    const { orgId } = await params;
    const membership = await getOrgMembership(orgId, auth.user.id);
    if (!membership) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const row = await queryOne<{
      org_id: string;
      plan_id: string | null;
      plan_name: string | null;
      status: string | null;
      price_usd: number | null;
      current_period_end: string | null;
    }>(
      `SELECT os.org_id, os.plan_id, sp.name AS plan_name, os.status,
              sp.price_usd, os.current_period_end
         FROM org_subscriptions os
         LEFT JOIN subscription_plans sp ON sp.id = os.plan_id
        WHERE os.org_id = $1
        ORDER BY os.updated_at DESC
        LIMIT 1`,
      [orgId],
    );

    if (!auth.user.emailVerified) {
      return NextResponse.json({
        state: "email_verification_required" satisfies OnboardingState,
        title: "Email verification required",
        message: "Verify your email before continuing to payment and activating Clara AI.",
        actionLabel: "Verify email",
        actionHref: "/login/verify-email",
        secondaryActionLabel: "Resend verification",
        secondaryAction: "RESEND_VERIFICATION",
      });
    }

    if (!row || !row.plan_id || (row.price_usd ?? 0) <= 0) {
      return NextResponse.json({
        state: "subscription_required" satisfies OnboardingState,
        title: "Choose a Clara AI plan",
        message: "Select a paid plan to activate Clara AI for this organization.",
        actionLabel: "View plans",
        actionHref: "/subscriptions",
      });
    }

    const state = row.status ?? "subscription_required";
    if (state === "active" || state === "trialing") {
      return NextResponse.json({
        state: "ready" satisfies OnboardingState,
        planName: row.plan_name,
        currentPeriodEnd: row.current_period_end,
      });
    }

    if (PAYMENT_STATES.has(state)) {
      const labels: Record<string, { title: string; message: string; actionLabel: string }> = {
        payment_required: {
          title: "Payment required",
          message: "Your organization is verified, but payment has not been completed. Continue payment to activate Clara AI.",
          actionLabel: "Continue payment",
        },
        payment_pending: {
          title: "Payment processing",
          message: "Your payment is being confirmed. You do not need to pay again while confirmation is pending.",
          actionLabel: "View billing",
        },
        payment_failed: {
          title: "Payment needs attention",
          message: "The previous payment was not completed. You can safely retry the payment.",
          actionLabel: "Retry payment",
        },
        payment_cancelled: {
          title: "Payment cancelled",
          message: "The payment was cancelled before activation. Continue payment when you are ready.",
          actionLabel: "Continue payment",
        },
        payment_review: {
          title: "Payment under review",
          message: "Payment information needs verification before Clara AI can be activated. Please do not submit another payment yet.",
          actionLabel: "View billing",
        },
      };

      const label = labels[state];
      return NextResponse.json({
        state: state as OnboardingState,
        title: label.title,
        message: label.message,
        actionLabel: label.actionLabel,
        actionHref: state === "payment_pending" || state === "payment_review"
          ? `/orgs/${orgId}/billing`
          : `/checkout?plan=${encodeURIComponent(row.plan_id)}&orgId=${encodeURIComponent(orgId)}`,
        planName: row.plan_name,
      });
    }

    return NextResponse.json({
      state: "subscription_required" satisfies OnboardingState,
      title: "Subscription required",
      message: "An active Clara AI subscription is required to use this organization workspace.",
      actionLabel: "View billing",
      actionHref: `/orgs/${orgId}/billing`,
      planName: row.plan_name,
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[onboarding-status] failed", error);
    return NextResponse.json({ error: "Unable to load onboarding status" }, { status: 500 });
  }
}
