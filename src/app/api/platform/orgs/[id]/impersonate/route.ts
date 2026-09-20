/**
 * src/app/api/platform/orgs/[id]/impersonate/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2 platform API: "Admin session for any org (super-admin only)".
 *
 *   GET  /api/platform/orgs/:id/impersonate — list members eligible for
 *        impersonation (id, email, fullName, status, role).
 *   POST /api/platform/orgs/:id/impersonate — mint a tenant session for an
 *        existing member of the org. Body (all optional):
 *          { userId?: string, durationMinutes?: number }
 *
 * The minted token is a REAL stateful session for the target member: it
 * passes requireTenantScope exactly like that member's own login (platform
 * admins are otherwise blocked from tenant resources). This is the
 * sanctioned support/debug path into a tenant workspace.
 *
 * Guardrails:
 *   - super-admin caller required (403 otherwise, 401 unauthenticated)
 *   - target must be an active member of the org (default: first org_admin)
 *   - target must NOT be a super-admin — no privilege escalation
 *   - duration clamped to 5..480 minutes (default 60)
 *   - every mint is appended to audit_logs (action: org.impersonate)
 *   - the session's user_agent carries a visible impersonation marker so it
 *     is identifiable in the user's active-session list
 *
 * The response returns the token in the body (use as
 * `Authorization: Bearer <token>`); the caller decides whether to bind it to
 * a browser — the admin's own cookie session is never overwritten here.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, queryOne } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getUserById, createSession, writeAuditLog } from "@/modules/auth/core/db";
import { generateToken, hashToken } from "@/modules/auth/core/tokens";

type Params = { params: Promise<{ id: string }> };

const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 480;
const DEFAULT_DURATION_MINUTES = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrgRow {
  id: string;
  name: string;
  slug: string;
}

interface MemberRow {
  user_id: string;
  email: string;
  full_name: string | null;
  status: string;
  role_name: string;
}

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip") ?? "unknown";
}

async function getOrg(orgId: string): Promise<OrgRow | null> {
  return queryOne<OrgRow>(
    "SELECT id, name, slug FROM organisations WHERE id = $1",
    [orgId],
  );
}

/** Members of the org, org_admins first — used by both GET and POST defaulting. */
async function getMembers(orgId: string): Promise<MemberRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT om.user_id, u.email, u.full_name, u.status, r.name AS role_name
     FROM org_members om
     JOIN users u ON u.id = om.user_id
     JOIN roles r ON r.id = om.role_id
     WHERE om.org_id = $1
     ORDER BY (r.name = 'org_admin') DESC, u.created_at ASC`,
    [orgId],
  );
  return rows as unknown as MemberRow[];
}

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { id: orgId } = await params;
    if (!UUID_RE.test(orgId)) {
      return NextResponse.json({ error: "Invalid organisation id." }, { status: 400 });
    }
    const org = await getOrg(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });

    const members = await getMembers(orgId);
    return NextResponse.json({
      org,
      members: members.map((m) => ({
        userId: m.user_id,
        email: m.email,
        fullName: m.full_name,
        status: m.status,
        role: m.role_name,
        eligible: m.status === "active",
      })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/orgs/:id/impersonate]", err);
    return NextResponse.json({ error: "Failed to list impersonation targets." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { id: orgId } = await params;
    if (!UUID_RE.test(orgId)) {
      return NextResponse.json({ error: "Invalid organisation id." }, { status: 400 });
    }
    const org = await getOrg(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const requestedUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const durationMinutesRaw = Number(body?.durationMinutes ?? DEFAULT_DURATION_MINUTES);
    const durationMinutes = Number.isFinite(durationMinutesRaw)
      ? Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(durationMinutesRaw)))
      : DEFAULT_DURATION_MINUTES;

    // Resolve the impersonation target.
    const members = await getMembers(orgId);
    if (members.length === 0) {
      return NextResponse.json(
        { error: "Organisation has no members to impersonate." },
        { status: 409 },
      );
    }
    const target = requestedUserId
      ? members.find((m) => m.user_id === requestedUserId)
      : members.find((m) => m.role_name === "org_admin" && m.status === "active")
        ?? members.find((m) => m.status === "active");

    if (requestedUserId && !target) {
      return NextResponse.json(
        { error: "Requested user is not a member of this organisation." },
        { status: 404 },
      );
    }
    if (!target) {
      return NextResponse.json(
        { error: "Organisation has no active members to impersonate." },
        { status: 409 },
      );
    }

    // Guardrails: no escalating into another super-admin, no suspended users.
    const targetUser = await getUserById(target.user_id);
    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found." }, { status: 404 });
    }
    if (targetUser.isSuperAdmin) {
      return NextResponse.json(
        { error: "Impersonating another super-admin is not permitted." },
        { status: 403 },
      );
    }
    if (targetUser.status !== "active") {
      return NextResponse.json(
        { error: `Target user is ${targetUser.status} — only active users can be impersonated.` },
        { status: 403 },
      );
    }

    // Mint a real stateful session for the target member.
    const token = generateToken();
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const userAgent = `Clara-Impersonation by ${auth.user.email}`;
    await createSession(targetUser.id, hashToken(token), expiresAt, getIp(req), userAgent);

    // Tamper-evident trail: who impersonated whom, where, for how long.
    await writeAuditLog({
      userId: auth.user.id,
      orgId: org.id,
      action: "org.impersonate",
      resourceType: "organisation",
      resourceId: org.id,
      newData: {
        impersonatedUserId: targetUser.id,
        impersonatedEmail: targetUser.email,
        role: target.role_name,
        durationMinutes,
        expiresAt: expiresAt.toISOString(),
        ip: getIp(req),
      },
      ipAddress: getIp(req),
    });

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      durationMinutes,
      impersonated: {
        user: {
          id: targetUser.id,
          email: targetUser.email,
          fullName: targetUser.fullName,
        },
        role: target.role_name,
        org: { id: org.id, name: org.name, slug: org.slug },
      },
      usage: "Use as 'Authorization: Bearer <token>' — a real tenant session for this member.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/orgs/:id/impersonate]", err);
    return NextResponse.json({ error: "Failed to create impersonation session." }, { status: 500 });
  }
}
