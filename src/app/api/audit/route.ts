import { db } from "@/lib/db";
import { errorResponse, ApiError } from "@/lib/api-contract";
import { requirePlatformAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit — platform-admin audit viewer with filters by organisation,
 * actor, action, agent and time; cursor pagination; CSV export with the same
 * filters (plan §3.4).
 */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin(req);
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");
    const actorId = url.searchParams.get("actorId");
    const action = url.searchParams.get("action");
    const agentId = url.searchParams.get("agentId");
    const q = url.searchParams.get("q");
    const format = url.searchParams.get("format");
    const cursor = url.searchParams.get("cursor");
    const take = Math.min(Number(url.searchParams.get("take") ?? 30), 100);

    const where = {
      ...(orgId ? { orgId } : {}),
      ...(actorId ? { actorUserId: actorId } : {}),
      ...(action ? { action } : {}),
      ...(agentId ? { agentId } : {}),
      ...(q
        ? {
            OR: [
              { promptText: { contains: q } },
              { answerText: { contains: q } },
            ],
          }
        : {}),
    };

    const rows = await db.auditLog.findMany({
      where,
      orderBy: { seq: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        seq: true,
        orgId: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        agentId: true,
        kbId: true,
        conversationId: true,
        promptText: true,
        answerText: true,
        model: true,
        promptTokens: true,
        completionTokens: true,
        redactions: true,
        revealOfId: true,
        justification: true,
        createdAt: true,
      },
    });

    const [orgs, users, agents] = await Promise.all([
      db.organization.findMany({ select: { id: true, name: true } }),
      db.user.findMany({ select: { id: true, name: true, email: true } }),
      db.agent.findMany({ select: { id: true, name: true } }),
    ]);
    const orgNames = new Map(orgs.map((o) => [o.id, o.name]));
    const userNames = new Map(users.map((u) => [u.id, u]));
    const agentNames = new Map(agents.map((a) => [a.id, a.name]));

    const decorate = (r: (typeof rows)[number]) => ({
      ...r,
      orgName: orgNames.get(r.orgId) ?? r.orgId,
      actorName: userNames.get(r.actorUserId)?.name ?? r.actorUserId,
      agentName: r.agentId ? agentNames.get(r.agentId) ?? null : null,
    });

    if (format === "csv") {
      const header = [
        "seq",
        "createdAt",
        "org",
        "actor",
        "actorRole",
        "action",
        "agent",
        "model",
        "promptTokens",
        "completionTokens",
        "promptText",
        "answerText",
        "redactions",
      ].join(",");
      const esc = (v: unknown) =>
        `"${String(v ?? "")
          .replace(/"/g, '""')
          .replace(/\r?\n/g, " ")}"`;
      const lines = [header];
      for (const r of await db.auditLog.findMany({
        where,
        orderBy: { seq: "desc" },
        take: 5000,
      })) {
        lines.push(
          [
            r.seq,
            r.createdAt.toISOString(),
            orgNames.get(r.orgId) ?? r.orgId,
            userNames.get(r.actorUserId)?.name ?? r.actorUserId,
            r.actorRole,
            r.action,
            r.agentId ? agentNames.get(r.agentId) ?? "" : "",
            r.model ?? "",
            r.promptTokens ?? "",
            r.completionTokens ?? "",
            esc(r.promptText),
            esc(r.answerText),
            esc(r.redactions),
          ].join(",")
        );
      }
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="clara-audit-${new Date()
            .toISOString()
            .slice(0, 10)}.csv"`,
        },
      });
    }

    const hasMore = rows.length > take;
    const page = rows.slice(0, take).map(decorate);
    return Response.json({
      rows: page,
      nextCursor: hasMore ? rows[take].id : null,
      filters: {
        orgs: orgs.map((o) => ({ id: o.id, name: o.name })),
        users: users.map((u) => ({ id: u.id, name: u.name })),
        agents: agents.map((a) => ({ id: a.id, name: a.name })),
        actions: ["PROMPT", "ANSWER", "CONFIG", "BILLING", "REVEAL"],
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST() {
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET.");
}
