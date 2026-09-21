import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getEmailConfig, sendPlatformEmail } from "@/lib/email";
import { renderEmailTemplate, type EmailTemplateKey, EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email-templates";

/**
 * POST /api/platform/email/test
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends a real test email through the ACTIVE provider (resend or smtp) so the
 * platform admin can verify delivery end-to-end from Settings → Email Delivery.
 *
 * Body: { to: string, templateKey?: EmailTemplateKey }
 *   - No templateKey → the dedicated "test_email" template.
 *   - With templateKey → renders that template with sample data (handy for
 *     previewing an edited template in a real inbox).
 *
 * Sample data intentionally uses friendly values so admins instantly see which
 * placeholders rendered and which were left untouched.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = await req.json().catch(() => ({}) as { to?: string; templateKey?: string });
    const to = (body.to ?? "").toString().trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: "A valid recipient email address is required." }, { status: 400 });
    }

    const requestedKey = (body.templateKey ?? "").toString();
    const templateKey: EmailTemplateKey =
      requestedKey && requestedKey in EMAIL_TEMPLATE_DEFAULTS
        ? (requestedKey as EmailTemplateKey)
        : "test_email";

    const cfg = getEmailConfig();
    const sentAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

    const sampleVars: Record<string, string> = {
      userName: "Platform Admin",
      orgName: "Demo Organisation",
      planName: "Pro",
      oldPlan: "Starter",
      newPlan: "Pro",
      role: "org admin",
      trialEnd: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      trialDays: "7",
      note: "Sample admin note",
      resetUrl: "https://example.com/login/reset?token=sample-token",
      inviteUrl: "https://example.com/login/reset?token=sample-token",
      loginUrl: "https://example.com/login",
      renewUrl: "https://example.com/login",
      verifyUrl: "https://example.com/login/verify-email?token=sample-token",
      dashboardUrl: "https://example.com/dashboard",
      amount: "$49.00",
      receiptUrl: "https://example.com/dashboard",
      paymentId: "pay_sample-123456",
      provider: cfg.provider === "console" ? "none (dev mode)" : cfg.provider,
      sentAt,
      to,
    };

    const rendered = await renderEmailTemplate(templateKey, sampleVars, { force: true });
    if (!rendered) {
      return NextResponse.json(
        { error: `Template "${templateKey}" could not be rendered.` },
        { status: 500 },
      );
    }
    const result = await sendPlatformEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });

    return NextResponse.json({
      ok: result.sent,
      provider: result.provider,
      error: result.error ?? null,
      templateKey,
      templateSource: rendered.source,
      // Surface deactivation so the admin understands this template is NOT
      // being sent to real recipients right now (test sends bypass it).
      templateActive: !rendered.suppressed,
      subject: rendered.subject,
      from: cfg.provider === "smtp" ? cfg.smtp.fromAddress : cfg.fromAddress,
      sentAt,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/email/test]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
