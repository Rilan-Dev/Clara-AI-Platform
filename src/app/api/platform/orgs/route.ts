import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

/** Platform-admin-only organisation summaries. No tenant project/KB/AI details are returned. */
export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const perPage = Math.min(100, parseInt(searchParams.get("perPage") ?? "20"));
    const offset = (page - 1) * perPage;

    const [orgsR, totalR] = await Promise.all([
      query(`SELECT o.id, o.name, o.slug, o.logo_url, o.created_at,
                    COALESCE(pc.project_count, 0)::int AS project_count,
                    COALESCE(kc.kb_count, 0)::int AS kb_count
             FROM organisations o
             LEFT JOIN (SELECT org_id, COUNT(*)::int AS project_count FROM projects GROUP BY org_id) pc ON pc.org_id = o.id
             LEFT JOIN (SELECT p.org_id, COUNT(kb.id)::int AS kb_count FROM projects p LEFT JOIN knowledge_bases kb ON kb.project_id = p.id GROUP BY p.org_id) kc ON kc.org_id = o.id
             ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`, [perPage, offset]),
      query(`SELECT COUNT(*)::int AS total FROM organisations`),
    ]);

    const total = (totalR as { total: number }[])[0].total;
    return NextResponse.json({
      orgs: (orgsR as Record<string, unknown>[]).map((o) => ({ id: o.id, name: o.name, slug: o.slug, logo_url: o.logo_url, created_at: o.created_at, project_count: o.project_count, kb_count: o.kb_count })),
      total, page, perPage, totalPages: Math.ceil(total / perPage),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/orgs]", err);
    return NextResponse.json({ error: "Failed to fetch organisation summaries" }, { status: 500 });
  }
}
