import { errorResponse } from "@/lib/api-contract";
import { getUser, assertOrgScope } from "@/lib/session";
import { PLANS } from "@/lib/plans";
import { meters } from "@/lib/usage";
import { chatModels } from "@/lib/model-catalogue";

export const dynamic = "force-dynamic";

/** GET /api/plans?orgId= — catalogue + the org's live usage against limits. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = await getUser(req);
    const orgId = assertOrgScope(user, url.searchParams.get("orgId"));
    const m = await meters(orgId);
    return Response.json({
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        priceInr: p.priceInr,
        requestsDay: p.requestsDay,
        requestsMonth: p.requestsMonth,
        kbs: p.kbs,
        storageMb: Math.round(p.storageBytes / 1048576),
        seats: p.seats,
        features: p.features,
        maxModelTier: p.maxModelTier,
      })),
      current: {
        planId: m.plan.id,
        planName: m.plan.name,
        requestsToday: m.requestsToday,
        requestsTodayLimit: m.requestsTodayLimit,
        requestsMonth: m.requestsMonth,
        requestsMonthLimit: m.requestsMonthLimit,
        storageUsedBytes: m.storageUsedBytes,
        storageLimitBytes: m.storageLimitBytes,
        kbs: m.kbs,
        kbsLimit: m.kbsLimit,
      },
      models: chatModels().map((c) => ({
        id: c.id,
        displayName: c.displayName,
        tier: c.tier,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
