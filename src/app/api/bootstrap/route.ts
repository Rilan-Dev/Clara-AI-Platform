import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api-contract";
import { getUser } from "@/lib/session";
import { chatModels } from "@/lib/model-catalogue";

export const dynamic = "force-dynamic";

/**
 * GET /api/bootstrap — everything the SPA needs on load: the active demo
 * identity, organisations, their users/agents/KB counts, and the model
 * catalogue with tier gates so the UI can hide what a plan does not allow.
 */
export async function GET(req: Request) {
  try {
    const user = await getUser(req);
    const orgs = await db.organization.findMany({
      orderBy: { createdAt: "asc" },
    });
    const orgIds = orgs.map((o) => o.id);
    const [users, agents, kbs, conversations] = await Promise.all([
      db.user.findMany({
        where: { orgId: { in: orgIds } },
        select: { id: true, name: true, email: true, role: true, orgId: true },
        orderBy: { createdAt: "asc" },
      }),
      db.agent.findMany({
        where: { orgId: { in: orgIds } },
        orderBy: { createdAt: "asc" },
      }),
      db.knowledgeBase.groupBy({
        by: ["orgId"],
        where: { orgId: { in: orgIds } },
        _count: { _all: true },
      }),
      db.conversation.findMany({
        where: { orgId: { in: orgIds } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          orgId: true,
          agentId: true,
          title: true,
          createdAt: true,
        },
      }),
    ]);
    const kbCounts = new Map(kbs.map((k) => [k.orgId, k._count._all]));

    return Response.json({
      user,
      orgs: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        planId: o.planId,
        kbCount: kbCounts.get(o.id) ?? 0,
      })),
      users,
      agents,
      conversations,
      models: chatModels().map((m) => ({
        id: m.id,
        displayName: m.displayName,
        tier: m.tier,
        provider: m.provider,
      })),
      needsSeed: orgs.length === 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
