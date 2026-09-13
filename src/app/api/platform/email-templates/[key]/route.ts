import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  getEmailTemplate,
  updateEmailTemplate,
  EMAIL_TEMPLATE_DEFAULTS,
  type EmailTemplateKey,
} from "@/lib/email-templates";

/**
 * GET    /api/platform/email-templates/[key]  — fetch one template
 * PUT    /api/platform/email-templates/[key]  — save subject / bodyHtml / isActive
 *        Body: { subject?: string, bodyHtml?: string, isActive?: boolean }
 *        Every save is appended to email_template_audit (who/what/when).
 */
type Params = { params: Promise<{ key: string }> };

function isValidKey(key: string): key is EmailTemplateKey {
  return key in EMAIL_TEMPLATE_DEFAULTS;
}

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { key } = await params;
    if (!isValidKey(key)) return NextResponse.json({ error: "Unknown template key." }, { status: 404 });

    const template = await getEmailTemplate(key);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/email-templates/:key]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { key } = await params;
    if (!isValidKey(key)) return NextResponse.json({ error: "Unknown template key." }, { status: 404 });

    const body = await req.json().catch(
      () => ({}) as { subject?: string; bodyHtml?: string; isActive?: boolean },
    );

    if (body.subject !== undefined && (typeof body.subject !== "string" || body.subject.trim().length === 0)) {
      return NextResponse.json({ error: "Subject cannot be empty." }, { status: 400 });
    }
    if (body.bodyHtml !== undefined && (typeof body.bodyHtml !== "string" || body.bodyHtml.trim().length === 0)) {
      return NextResponse.json({ error: "Email body cannot be empty." }, { status: 400 });
    }

    const template = await updateEmailTemplate(
      key,
      {
        subject: body.subject?.trim(),
        bodyHtml: body.bodyHtml,
        isActive: body.isActive,
      },
      auth.user.id,
    );
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PUT /api/platform/email-templates/:key]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
