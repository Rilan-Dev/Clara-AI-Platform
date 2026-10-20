import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Chat session persistence — read, rename, delete a single session.
 *
 * GET    /api/chat/sessions/:id        → session + ordered messages
 * PATCH  /api/chat/sessions/:id {title} → rename
 * DELETE /api/chat/sessions/:id        → delete session + messages (cascade)
 *
 * Ownership is enforced on every operation: the WHERE clause includes user_id,
 * so a valid-looking session id belonging to another user simply 404s.
 */

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const { sessionId } = await params;

    const session = await pool.query<{
      id: string; kb_id: string | null; title: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT id, kb_id, title, created_at, updated_at
       FROM chat_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, auth.user.id],
    );
    if (session.rowCount === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sessionKbId = session.rows[0].kb_id;
    if (sessionKbId) {
      // User ownership alone is insufficient if organization membership
      // has been revoked since the conversation was saved.
      await requireKbPermission(auth, sessionKbId, "kb:read");
    }

    const messages = await pool.query<{
      id: string; role: string; content: string;
      sources: unknown; created_at: Date;
    }>(
      `SELECT id, role, content, sources, created_at
       FROM chat_messages WHERE session_id = $1
       ORDER BY created_at ASC, id ASC`,
      [sessionId],
    );

    const s = session.rows[0];
    return NextResponse.json({
      session: { id: s.id, kbId: s.kb_id, title: s.title, createdAt: s.created_at, updatedAt: s.updated_at },
      messages: messages.rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: Array.isArray(m.sources) ? m.sources : [],
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chat/session GET]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const { sessionId } = await params;
    const body = (await req.json().catch(() => ({}))) as { title?: string };

    const title = (body.title ?? "").trim().slice(0, 80);
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    const result = await pool.query<{ id: string; title: string }>(
      `UPDATE chat_sessions SET title = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id, title`,
      [sessionId, auth.user.id, title],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session: result.rows[0] });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chat/session PATCH]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const { sessionId } = await params;

    const result = await pool.query("DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2", [
      sessionId,
      auth.user.id,
    ]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chat/session DELETE]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
