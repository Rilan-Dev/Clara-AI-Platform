/**
 * GET /api/kbs/:kbId/scrape/sessions/:sessionId/failed-urls
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns all failed scrape URLs for a session, each with their complete
 * retry history, current retry_status, and next scheduled retry time.
 *
 * Used by the ScrapeWizard FailedUrlPanel to render the live retry dashboard.
 * Polled every 5s when there are 'scheduled' or 'retrying' entries.
 *
 * Response shape: FailedUrlWithRetries[]
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getSessionById } from "@/modules/knowledge-bases/core/scrape-sessions-db";
import { listFailedUrlsWithRetries } from "@/modules/knowledge-bases/core/scrape-url-retry-db";

// Add this helper function to check if user is platform admin
async function denyPlatformAdmin(auth: AuthContext): Promise<void> {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot access failed URLs" },
      { status: 403 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; sessionId: string }> }
): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const { kbId, sessionId } = await params;
    const auth = await requireAuth(req);
    await denyPlatformAdmin(auth); // Add this check
    await requireKbPermission(auth, kbId, "document:read");

    const session = await getSessionById(sessionId);
    if (!session || session.kbId !== kbId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const failedUrls = await listFailedUrlsWithRetries(sessionId);
    return NextResponse.json(failedUrls);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
