/**
 * GET /api/analytics/audit/verify
 * ─────────────────────────────────────────────────────────────────────────────
 * WS-1.4: recompute the per-org hash chain over the Q&A audit trail and
 * report integrity. Any after-the-fact modification of a hashed row (or its
 * predecessor) breaks the chain visibly.
 *
 * Query params:
 *   orgId   verify a single organisation (optional — omit to verify all)
 *
 * Auth: super-admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { verifyQueryEventChain } from "@/modules/knowledge-bases/core/analytics-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const orgIdParam = req.nextUrl.searchParams.get("orgId") ?? "";
    const orgId = UUID_RE.test(orgIdParam) ? orgIdParam : undefined;

    const results = await verifyQueryEventChain(orgId);

    const totalRows = results.reduce((sum, r) => sum + r.rowsVerified, 0);
    const totalBreaks = results.reduce((sum, r) => sum + r.breaks.length, 0);

    return NextResponse.json({
      verifiedAt: new Date().toISOString(),
      scope: orgId ?? "all",
      orgs: results.length,
      rowsVerified: totalRows,
      breaks: totalBreaks,
      integrity: totalBreaks === 0 ? "intact" : "compromised",
      results,
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/analytics/audit/verify]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
