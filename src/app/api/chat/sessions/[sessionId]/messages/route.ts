import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth } from "@/modules/auth/core/rbac";
import { pool } from "@/lib/db";

type Params = { params: Promise<{ sessionId: string }> };

type IncomingMessage = {
  id?: string;
  role?: string;
  content?: string;
  sources?: unknown;
};

/**
 * Chat session persistence — append a batch of completed messages.
 *
 * POST /api/chat/sessions/:id/messages
 *   { messages: [{ id, role: "user"|"assistant", content, sources? }] }
 *
 * Called once per completed conversation turn (user + assistant message
 * together). Streaming updates are NOT persisted — only the final turn.
 * Failures are non-fatal for the chat itself: the client treats persistence
 * errors as warnings.
 */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const { sessionId } = await params;
    const body = (await req.json().catch(() => ({}))) as { messages?: IncomingMessage[] };

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const valid = incoming.filter(
      (m) =>
        m &&
        typeof m.id === "string" && m.id.length <= 100 &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
    if (valid.length === 0) {
      return NextResponse.json({ error: "messages array with at least one valid message is required" }, { status: 400 });
    }

    const session = await pool.query<{ id: string; title: string }>(
      "SELECT id, title FROM chat_sessions WHERE id = $1 AND user_id = $2",
      [sessionId, auth.user.id],
    );
    if (session.rowCount === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Insert messages; client message ids are the primary key, so a duplicate
    // turn (e.g. retried request) is ignored rather than duplicated.
    for (const m of valid) {
      await pool.query(
        `INSERT INTO chat_messages (id, session_id, role, content, sources)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [m.id, sessionId, m.role, m.content, JSON.stringify(Array.isArray(m.sources) ? m.sources : [])],
      );
    }

    // Auto-title: while the session still has the default title, promote the
    // first persisted user message to a human-readable conversation title.
    if (session.rows[0].title === "New conversation") {
      const firstUser = valid.find((m) => m.role === "user");
      const firstUserContent = typeof firstUser?.content === "string" ? firstUser.content : "";
      if (firstUserContent.trim()) {
        const title = firstUserContent.trim().replace(/\s+/g, " ").slice(0, 60);
        if (title) {
          await pool.query("UPDATE chat_sessions SET title = $3 WHERE id = $1 AND user_id = $2", [
            sessionId,
            auth.user.id,
            title,
          ]);
        }
      }
    }

    await pool.query("UPDATE chat_sessions SET updated_at = now() WHERE id = $1", [sessionId]);

    return NextResponse.json({ success: true, persisted: valid.length }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chat/messages POST]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
