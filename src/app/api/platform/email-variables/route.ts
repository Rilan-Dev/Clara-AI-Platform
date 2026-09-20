import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  listEmailTemplateVariables,
  createEmailTemplateVariable,
  EmailVariableError,
} from "@/lib/email-templates";

/**
 * GET  /api/platform/email-variables  — full managed catalogue (system ∪ custom)
 * POST /api/platform/email-variables  — create a CUSTOM variable
 *        Body: { name, category, description, value }
 *
 * System variables (userName, resetUrl…) are supplied by the platform at send
 * time — they are listed read-only and can never be created, renamed or
 * deleted. Custom variables are static values injected into every render.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const variables = await listEmailTemplateVariables();
    return NextResponse.json({
      variables,
      categories: ["auth", "invitation", "subscription", "system", "custom"],
      count: variables.length,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/email-variables]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = await req.json().catch(
      () => ({}) as { name?: string; category?: string; description?: string; value?: string },
    );

    const name = typeof body.name === "string" ? body.name : "";
    const category = typeof body.category === "string" ? body.category : "custom";
    const description = typeof body.description === "string" ? body.description : "";
    const value = typeof body.value === "string" ? body.value : "";

    const variable = await createEmailTemplateVariable(
      { name, category, description, value },
      auth.user.id,
    );
    return NextResponse.json({ ok: true, variable }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof EmailVariableError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/platform/email-variables]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
