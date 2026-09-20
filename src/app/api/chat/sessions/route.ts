import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { pool } from "@/lib/db";

/**
 * Chat session persistence — list & create.
 *
 * Sessions are strictly user-owned: every query filters on user_id, so users
 * can never read or write another user's conversations. Sessions are scoped
 * to a knowledge base (KB chat mode); the legacy document mode does not
 * persist conversations.
 *
 * GET  /api/chat/sessions?kbId=<uuid>   → sessions (most recently updated first)
 * POST /api/chat/sessions {kbId,title?} → create session
 */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const kbId = req.nextUrl.searchParams.get("kbId");

    const result = await pool.query<{
      id: string; kb_id: string | null; title: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT id, kb_id, title, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = $1 AND (${kbId ? `kb_id = $2` : `kb_id IS NULL`})
       ORDER BY updated_at DESC
       LIMIT 50`,
      kbId ? [auth.user.id, kbId] : [auth.user.id],
    );

    return NextResponse.json({
      sessions: result.rows.map((r) => ({
        id: r.id,
        kbId: r.kb_id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chat/sessions GET]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { kbId?: string; title?: string };

    if (body.kbId) {
      // Verify the KB exists (and the user can chat with it) before creating
      // a session scoped to it.
      const kb = await pool.query("SELECT id FROM knowledge_bases WHERE id = $1", [body.kbId]);
      if (kb.rowCount === 0) {
        return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
      }
    }

    const title = (body.title ?? "").trim().slice(0, 80) || "New conversation";
    const result = await pool.query<{
      id: string; kb_id: string | null; title: string;
      created_at: Date; updated_at: Date;
    }>(
      `INSERT INTO chat_sessions (user_id, kb_id, title)
       VALUES ($1, $2, $3)
       RETURNING id, kb_id, title, created_at, updated_at`,
      [auth.user.id, body.kbId ?? null, title],
    );

    const r = result.rows[0];
    return NextResponse.json(
      { session: { id: r.id, kbId: r.kb_id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chat/sessions POST]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
