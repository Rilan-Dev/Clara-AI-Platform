import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { listEmailTemplates } from "@/lib/email-templates";

/**
 * GET /api/platform/email-templates
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists every transactional email template (seeding defaults first). Used by
 * the Settings → Email Templates editor.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const templates = await listEmailTemplates();
    return NextResponse.json({
      templates,
      categories: ["auth", "invitation", "subscription", "system"],
      count: templates.length,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/email-templates]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
