import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api-contract";
import { getUser, assertOrgScope } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/questions?orgId=&q= — the organisation dashboard's
 * user-questions panel (plan §3.4): a scoped, searchable list of the
 * organisation's own questions with answer status and feedback signal.
 * Org members can never see another organisation's questions.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = await getUser(req);
    const orgId = assertOrgScope(user, url.searchParams.get("orgId"));
    const q = url.searchParams.get("q");
    const take = Math.min(Number(url.searchParams.get("take") ?? 50), 200);

    const prompts = await db.auditLog.findMany({
      where: {
        orgId,
        action: "PROMPT",
        ...(q ? { promptText: { contains: q } } : {}),
      },
      orderBy: { seq: "desc" },
      take,
    });

    const users = await db.user.findMany({
      where: { orgId },
      select: { id: true, name: true },
    });
    const userNames = new Map(users.map((u) => [u.id, u.name]));

    const rows = [];
    for (const p of prompts) {
      const answer = p.conversationId
        ? await db.auditLog.findFirst({
            where: {
              orgId,
              action: "ANSWER",
              conversationId: p.conversationId,
              seq: { gt: p.seq },
            },
            orderBy: { seq: "asc" },
          })
        : null;
      rows.push({
        id: p.id,
        seq: p.seq,
        question: p.promptText,
        askedBy: userNames.get(p.actorUserId) ?? "Unknown user",
        askedAt: p.createdAt.toISOString(),
        agentId: p.agentId,
        conversationId: p.conversationId,
        answered: !!answer,
        answeredAt: answer?.createdAt.toISOString() ?? null,
        answerPreview: answer?.answerText?.slice(0, 160) ?? null,
        model: answer?.model ?? p.model,
        truncated: !!answer?.answerText?.startsWith("(cancelled"),
      });
    }

    return Response.json({ rows, total: rows.length });
  } catch (err) {
    return errorResponse(err);
  }
}
