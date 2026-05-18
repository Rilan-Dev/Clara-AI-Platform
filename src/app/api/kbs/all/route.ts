/**
 * GET /api/kbs/all?orgId=<uuid>
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns knowledge bases that belong to the requested org.
 *
 * RBAC rules:
 *  - Caller must be authenticated (valid Bearer token / cookie).
 *  - Caller must be a member of the requested org (or a super-admin).
 *  - Only KBs whose org matches orgId are returned — never cross-org data.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // ── 1. Authenticate ──────────────────────────────────────────────────────
    const auth = await requireAuth(req);

    // ── 2. Validate orgId query param (Now Optional) ─────────────────────────
    const orgId = req.nextUrl.searchParams.get("orgId");

    // ── 3. Verify permissions & build query ──────────────────────────────────
    let whereClause = "kb.status = 'active'";
    const queryParams: unknown[] = [];

    if (orgId) {
      await requireOrgPermission(auth, orgId, "kb:read");
      whereClause += " AND o.id = $1";
      queryParams.push(orgId);
    } else if (!auth.user.isSuperAdmin) {
      whereClause += " AND o.id IN (SELECT org_id FROM org_members WHERE user_id = $1)";
      queryParams.push(auth.user.id);
    }

    // ── 4. Query ─────────────────────────────────────────────────────────────
    const result = await pool.query<{
      kb_id: string;
      kb_name: string;
      kb_description: string | null;
      kb_status: string;
      qdrant_collection: string;
      project_id: string;
      project_name: string;
      org_id: string;
      org_name: string;
      assistant_name: string;
      avatar_url: string | null;
      welcome_message: string;
      primary_colour: string;
      accent_colour: string;
      doc_count: string;
      ready_count: string;
    }>(
      `SELECT
         kb.id                  AS kb_id,
         kb.name                AS kb_name,
         kb.description         AS kb_description,
         kb.status              AS kb_status,
         kb.qdrant_collection,
         p.id                   AS project_id,
         p.name                 AS project_name,
         o.id                   AS org_id,
         o.name                 AS org_name,
         COALESCE(ac.assistant_name,  'Clara')   AS assistant_name,
         ac.avatar_url,
         COALESCE(ac.welcome_message, 'Hello! How can I help you with this knowledge base today?') AS welcome_message,
         COALESCE(ac.system_prompt,    'You are Clara, a helpful voice assistant. Answer ONLY using the context provided.') AS system_prompt,
         COALESCE(ac.primary_colour,  '#6366f1') AS primary_colour,
         COALESCE(ac.accent_colour,   '#a5b4fc') AS accent_colour,
         COUNT(d.id)                              AS doc_count,
         COUNT(d.id) FILTER (WHERE d.status = 'ready') AS ready_count
       FROM knowledge_bases kb
       JOIN projects        p  ON p.id  = kb.project_id
       JOIN organisations   o  ON o.id  = p.org_id
       LEFT JOIN assistant_configs ac ON ac.kb_id = kb.id
       LEFT JOIN documents  d  ON d.kb_id = kb.id
       WHERE ${whereClause}
       GROUP BY kb.id, p.id, o.id,
                ac.assistant_name, ac.avatar_url, ac.welcome_message, ac.system_prompt,
                ac.primary_colour, ac.accent_colour
       ORDER BY p.name ASC, kb.name ASC`,
      queryParams
    );

    const kbs = result.rows.map((r) => ({
      id:               r.kb_id,
      name:             r.kb_name,
      description:      r.kb_description,
      status:           r.kb_status,
      qdrantCollection: r.qdrant_collection,
      project: {
        id:   r.project_id,
        name: r.project_name,
      },
      org: {
        id:   r.org_id,
        name: r.org_name,
      },
      assistant: {
        name:           r.assistant_name,
        avatarUrl:      r.avatar_url,
        welcomeMessage: r.welcome_message,
        systemPrompt:   r.system_prompt,
        primaryColour:  r.primary_colour,
        accentColour:   r.accent_colour,
      },
      docCount:   parseInt(r.doc_count   ?? "0", 10),
      readyCount: parseInt(r.ready_count ?? "0", 10),
    }));

    return NextResponse.json({ kbs });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[kbs/all]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
