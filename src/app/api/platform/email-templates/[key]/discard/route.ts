import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { discardEmailTemplateDraft, EMAIL_TEMPLATE_DEFAULTS, type EmailTemplateKey } from "@/lib/email-templates";

/**
 * POST /api/platform/email-templates/[key]/discard
 * ─────────────────────────────────────────────────────────────────────────────
 * Deletes the in-progress draft. The published content is untouched, so this
 * needs no audit entry — nothing that reaches recipients has changed.
 */
type Params = { params: Promise<{ key: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { key } = await params;
    if (!(key in EMAIL_TEMPLATE_DEFAULTS)) {
      return NextResponse.json({ error: "Unknown template key." }, { status: 404 });
    }

    const template = await discardEmailTemplateDraft(key as EmailTemplateKey);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/email-templates/:key/discard]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
