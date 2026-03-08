/**
 * GET /api/kbs/all
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns a flat list of ALL active knowledge bases across all orgs/projects —
 * with their assistant config name and welcome message baked in.
 * Used by the workspace KB selector so users can pick which KB to talk to.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { pool } from "@/lib/db";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

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
         COALESCE(ac.assistant_name,  'Clara')  AS assistant_name,
         ac.avatar_url,
         COALESCE(ac.welcome_message, 'Hello! How can I help you today?') AS welcome_message,
         COALESCE(ac.primary_colour,  '#6366f1') AS primary_colour,
         COALESCE(ac.accent_colour,   '#a5b4fc') AS accent_colour,
         COUNT(d.id)                             AS doc_count,
         COUNT(d.id) FILTER (WHERE d.status = 'ready') AS ready_count
       FROM knowledge_bases kb
       JOIN projects        p  ON p.id  = kb.project_id
       JOIN organisations   o  ON o.id  = p.org_id
       LEFT JOIN assistant_configs ac ON ac.kb_id = kb.id
       LEFT JOIN documents  d  ON d.kb_id = kb.id
       WHERE kb.status = 'active'
       GROUP BY kb.id, p.id, o.id, ac.assistant_name, ac.avatar_url,
                ac.welcome_message, ac.primary_colour, ac.accent_colour
       ORDER BY o.name ASC, p.name ASC, kb.name ASC`
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
        primaryColour:  r.primary_colour,
        accentColour:   r.accent_colour,
      },
      docCount:   parseInt(r.doc_count  ?? "0", 10),
      readyCount: parseInt(r.ready_count ?? "0", 10),
    }));

    return NextResponse.json({ kbs });
  } catch (err) {
    console.error("[kbs/all]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
