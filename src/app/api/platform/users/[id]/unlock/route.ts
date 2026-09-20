/**
 * src/app/api/platform/users/[id]/unlock/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 6.1: super-admin account unlock for login lockout.
 *
 *   POST /api/platform/users/:id/unlock
 *
 * Resets failed_login_attempts to 0 and clears locked_until, allowing a
 * user whose account was locked after 10 consecutive failed logins to sign
 * in again immediately (otherwise the lock auto-expires after 30 minutes).
 *
 * Guardrails:
 *   - super-admin caller required (403 otherwise, 401 unauthenticated)
 *   - every unlock is appended to audit_logs (action: auth.account_unlocked)
 *   - response reports the previous counter/lock state for the audit trail
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { queryOne } from "@/lib/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { getUserById, clearLoginLockout, writeAuditLog } from "@/modules/auth/core/db";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const { id: userId } = await params;
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Invalid user id.", code: "INVALID_INPUT", status: 400 }, { status: 400 });
    }

    // Capture the pre-unlock state for the response + audit trail.
    const before = await queryOne<Record<string, unknown>>(
      "SELECT failed_login_attempts, locked_until FROM users WHERE id = $1",
      [userId],
    );
    if (!before) {
      return NextResponse.json({ error: "User not found.", code: "NOT_FOUND", status: 404 }, { status: 404 });
    }

    const user = await getUserById(userId);
    const unlocked = await clearLoginLockout(userId);

    await writeAuditLog({
      userId: auth.user.id,
      action: "auth.account_unlocked",
      resourceType: "user",
      resourceId: userId,
      oldData: {
        failedLoginAttempts: Number(before.failed_login_attempts ?? 0),
        lockedUntil: before.locked_until != null ? String(before.locked_until) : null,
      },
      newData: { unlockedBy: auth.user.email },
      ipAddress: getIp(req),
    });

    return NextResponse.json({
      unlocked,
      user: user ? { id: user.id, email: user.email, fullName: user.fullName, status: user.status } : null,
      previousState: {
        failedLoginAttempts: Number(before.failed_login_attempts ?? 0),
        lockedUntil: before.locked_until != null ? String(before.locked_until) : null,
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/platform/users/:id/unlock]", err);
    return NextResponse.json(
      { error: "Failed to unlock account.", code: "INTERNAL_ERROR", status: 500 },
      { status: 500 },
    );
  }
}
