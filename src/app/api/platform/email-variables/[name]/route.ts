import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  updateEmailTemplateVariable,
  deleteEmailTemplateVariable,
  EmailVariableError,
} from "@/lib/email-templates";

/**
 * PUT    /api/platform/email-variables/[name] — edit a variable
 *        Body: { description?, value?, category? }
 *        · system variables: description only (value comes from the platform)
 *        · custom variables: description, value, category
 *        The name itself is immutable — it is the {{placeholder}} contract.
 *
 * DELETE /api/platform/email-variables/[name]?force=true
 *        Custom variables only. Blocked while any template still uses the
 *        variable; pass force=true to delete anyway (placeholders then render
 *        literally, which makes them easy to spot).
 */
type Params = { params: Promise<{ name: string }> };

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { name } = await params;
    const body = await req.json().catch(
      () => ({}) as { description?: string; value?: string; category?: string },
    );

    const variable = await updateEmailTemplateVariable(
      decodeURIComponent(name),
      {
        description: typeof body.description === "string" ? body.description : undefined,
        value: typeof body.value === "string" ? body.value : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
      },
      auth.user.id,
    );
    return NextResponse.json({ ok: true, variable });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof EmailVariableError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[PUT /api/platform/email-variables/:name]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { name } = await params;
    const force = new URL(req.url).searchParams.get("force") === "true";

    const result = await deleteEmailTemplateVariable(decodeURIComponent(name), { force });
    if (!result.deleted) {
      return NextResponse.json(
        {
          error: `Still used by ${result.usedIn.length} template(s): ${result.usedIn.join(", ")}. Remove it from those templates first, or repeat with force=true.`,
          usedIn: result.usedIn,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, usedIn: result.usedIn });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof EmailVariableError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[DELETE /api/platform/email-variables/:name]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
