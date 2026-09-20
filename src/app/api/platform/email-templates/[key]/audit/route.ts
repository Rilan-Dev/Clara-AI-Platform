import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { listEmailTemplateAudit, EMAIL_TEMPLATE_DEFAULTS, type EmailTemplateKey } from "@/lib/email-templates";

/**
 * GET /api/platform/email-templates/[key]/audit
 * ─────────────────────────────────────────────────────────────────────────────
 * Recent LIVE changes (publish / reset / toggle) for the template's history
 * panel. Draft saves are intentionally absent — only changes that affected
 * real recipients are recorded.
 */
type Params = { params: Promise<{ key: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { key } = await params;
    if (!(key in EMAIL_TEMPLATE_DEFAULTS)) {
      return NextResponse.json({ error: "Unknown template key." }, { status: 404 });
    }

    const limitParam = new URL(req.url).searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

    const entries = await listEmailTemplateAudit(key as EmailTemplateKey, limit);
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/email-templates/:key/audit]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
