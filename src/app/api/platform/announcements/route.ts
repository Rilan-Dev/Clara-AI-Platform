import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) {
      const rows = await query(
        `SELECT id, title, message, severity, action_label, action_href, audience,
                starts_at, ends_at, dismissible, priority, created_at, updated_at
           FROM platform_announcements
          ORDER BY priority DESC, starts_at DESC
          LIMIT 100`,
      );
      return NextResponse.json({ announcements: rows });
    }

    const rows = await query(
      `SELECT id, title, message, severity, action_label, action_href,
              dismissible, priority, starts_at, ends_at
         FROM platform_announcements
        WHERE starts_at <= now()
          AND (ends_at IS NULL OR ends_at > now())
          AND (audience = 'all' OR
               (audience = 'paid' AND EXISTS (
                 SELECT 1 FROM org_members om
                 JOIN org_subscriptions os ON os.org_id = om.org_id
                 WHERE om.user_id = $1 AND os.status IN ('active','trialing')
               )) OR
               (audience = 'trialing' AND EXISTS (
                 SELECT 1 FROM org_members om
                 JOIN org_subscriptions os ON os.org_id = om.org_id
                 WHERE om.user_id = $1 AND os.status = 'trialing'
               )))
        ORDER BY priority DESC, starts_at DESC
        LIMIT 10`,
      [auth.user.id],
    );
    return NextResponse.json({ announcements: rows });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[announcements] GET failed", error);
    return NextResponse.json({ error: "Unable to load announcements" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = (await req.json()) as {
      title?: string;
      message?: string;
      severity?: string;
      actionLabel?: string;
      actionHref?: string;
      audience?: string;
      startsAt?: string;
      endsAt?: string | null;
      dismissible?: boolean;
      priority?: number;
    };

    if (!body.title?.trim() || !body.message?.trim()) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const severity = ["info", "success", "warning", "critical"].includes(body.severity ?? "")
      ? body.severity
      : "info";
    const audience = ["all", "paid", "trialing"].includes(body.audience ?? "")
      ? body.audience
      : "all";

    const rows = await query(
      `INSERT INTO platform_announcements
        (title, message, severity, action_label, action_href, audience,
         starts_at, ends_at, dismissible, priority, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()),$8,$9,$10,$11)
       RETURNING id, title, message, severity, action_label, action_href, audience,
                 starts_at, ends_at, dismissible, priority, created_at, updated_at`,
      [
        body.title.trim(),
        body.message.trim(),
        severity,
        body.actionLabel?.trim() || null,
        body.actionHref?.trim() || null,
        audience,
        body.startsAt || null,
        body.endsAt || null,
        body.dismissible !== false,
        Number.isFinite(body.priority) ? body.priority : 0,
        auth.user.id,
      ],
    );

    return NextResponse.json({ announcement: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[announcements] POST failed", error);
    return NextResponse.json({ error: "Unable to create announcement" }, { status: 500 });
  }
}
