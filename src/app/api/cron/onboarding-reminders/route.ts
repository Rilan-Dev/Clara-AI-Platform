import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, queryOne } from "@/lib/db";
import { sendPlatformEmail } from "@/lib/email";
import { createEmailVerificationToken } from "@/modules/auth/api/email-verification";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureMigrated();

    const rows = await query<{
      org_id: string;
      org_name: string;
      user_id: string;
      email: string;
      full_name: string;
      email_verified: boolean;
      plan_id: string;
      plan_name: string;
      status: string;
    }>(
      `SELECT DISTINCT ON (os.org_id)
          os.org_id, o.name AS org_name, u.id AS user_id, u.email, u.full_name,
          u.email_verified, os.plan_id, sp.name AS plan_name, os.status
       FROM org_subscriptions os
       JOIN organisations o ON o.id = os.org_id
       JOIN subscription_plans sp ON sp.id = os.plan_id
       JOIN org_members om ON om.org_id = os.org_id
       JOIN roles r ON r.id = om.role_id AND r.name = 'org_admin'
       JOIN users u ON u.id = om.user_id
      WHERE sp.price_usd > 0
        AND os.status IN ('pending_email','payment_required','payment_pending','payment_failed','payment_cancelled','payment_review')
        AND u.status = 'active'
        AND (os.last_onboarding_reminder_at IS NULL OR os.last_onboarding_reminder_at::date < CURRENT_DATE)
      ORDER BY os.org_id, os.updated_at DESC
      LIMIT 100`,
    [],
  );

    const origin = resolvePublicOrigin(req);
    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        if (!row.email_verified) {
          const token = await createEmailVerificationToken(row.user_id, "vercel-cron");
          const verifyUrl = `${origin}/login/verify-email?token=${encodeURIComponent(token)}`;
          const result = await sendPlatformEmail({
            to: row.email,
            subject: "Complete your Clara AI registration",
            html: `<p>Hello ${row.full_name || "there"},</p>
              <p>Your Clara AI <strong>${row.plan_name}</strong> registration is waiting for email verification.</p>
              <p><a href="${verifyUrl}">Verify your email</a> to continue.</p>
              <p>You cannot start payment until your email is verified.</p>`,
          });
          if (!result.sent) throw new Error(result.error ?? "Email provider rejected the message");
        } else if (row.status === "payment_review") {
          const support = process.env.CLARA_SUPPORT_EMAIL;
          if (!support) throw new Error("CLARA_SUPPORT_EMAIL is not configured");
          const result = await sendPlatformEmail({
            to: support,
            subject: `Clara AI payment review required: ${row.org_name}`,
            html: `<p>Payment was received or reported for <strong>${row.org_name}</strong> but activation requires manual verification.</p>
              <p>Organization: ${row.org_id}</p><p>Plan: ${row.plan_name}</p>
              <p>Review the billing history and payment gateway details before activation.</p>`,
          });
          if (!result.sent) throw new Error(result.error ?? "Support notification failed");
        } else {
          const checkoutUrl = `${origin}/checkout?plan=${encodeURIComponent(row.plan_id)}&orgId=${encodeURIComponent(row.org_id)}`;
          const result = await sendPlatformEmail({
            to: row.email,
            subject: `Continue your Clara AI ${row.plan_name} payment`,
            html: `<p>Hello ${row.full_name || "there"},</p>
              <p>Your Clara AI <strong>${row.plan_name}</strong> plan is reserved, but payment has not been completed.</p>
              <p><a href="${checkoutUrl}">Continue payment</a> to activate your workspace.</p>`,
          });
          if (!result.sent) throw new Error(result.error ?? "Email provider rejected the message");
        }

        await query(
          "UPDATE org_subscriptions SET last_onboarding_reminder_at = now(), updated_at = now() WHERE org_id = $1",
          [row.org_id],
        );
        sent++;
      } catch (err) {
        failed++;
        console.error("[onboarding-reminder] failed for org", row.org_id, (err as Error).message);
      }
    }

    return NextResponse.json({ ok: true, scanned: rows.length, sent, failed });
  } catch (err) {
    console.error("[onboarding-reminder] fatal", err);
    return NextResponse.json({ error: "Onboarding reminder job failed" }, { status: 500 });
  }
}
