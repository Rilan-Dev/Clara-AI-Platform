import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

type Params = { params: Promise<{ id: string }> };

async function admin(req: NextRequest) {
  const auth = await requireAuth(req);
  await requireSuperAdmin(auth);
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await admin(req);
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const allowed = {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      message: typeof body.message === "string" ? body.message.trim() : undefined,
      severity: typeof body.severity === "string" ? body.severity : undefined,
      actionLabel: typeof body.actionLabel === "string" ? body.actionLabel.trim() : undefined,
      actionHref: typeof body.actionHref === "string" ? body.actionHref.trim() : undefined,
      audience: typeof body.audience === "string" ? body.audience : undefined,
      startsAt: typeof body.startsAt === "string" ? body.startsAt : undefined,
      endsAt: typeof body.endsAt === "string" ? body.endsAt : null,
      dismissible: typeof body.dismissible === "boolean" ? body.dismissible : undefined,
      priority: typeof body.priority === "number" ? body.priority : undefined,
    };

    const rows = await query(
      `UPDATE platform_announcements
          SET title = COALESCE($2,title),
              message = COALESCE($3,message),
              severity = COALESCE($4,severity),
              action_label = COALESCE($5,action_label),
              action_href = COALESCE($6,action_href),
              audience = COALESCE($7,audience),
              starts_at = COALESCE($8::timestamptz,starts_at),
              ends_at = CASE WHEN $9::boolean THEN NULL ELSE COALESCE($10::timestamptz,ends_at) END,
              dismissible = COALESCE($11,dismissible),
              priority = COALESCE($12,priority),
              updated_at = now()
        WHERE id = $1
        RETURNING id, title, message, severity, action_label, action_href, audience,
                  starts_at, ends_at, dismissible, priority, created_at, updated_at`,
      [
        id, allowed.title, allowed.message, allowed.severity, allowed.actionLabel,
        allowed.actionHref, allowed.audience, allowed.startsAt,
        body.endsAt === null, allowed.endsAt, allowed.dismissible, allowed.priority,
      ],
    );
    if (!rows[0]) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    return NextResponse.json({ announcement: rows[0] });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[announcements] PATCH failed", error);
    return NextResponse.json({ error: "Unable to update announcement" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await admin(req);
    const { id } = await params;
    const result = await query(`DELETE FROM platform_announcements WHERE id = $1 RETURNING id`, [id]);
    if (!result[0]) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[announcements] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete announcement" }, { status: 500 });
  }
}
