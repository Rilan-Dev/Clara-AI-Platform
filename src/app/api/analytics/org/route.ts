import { errorResponse } from "@/lib/api-contract";
import { getUser, assertOrgScope } from "@/lib/session";
import { meters, orgAnalytics } from "@/lib/usage";

export const dynamic = "force-dynamic";

/** GET /api/analytics/org?orgId= — org dashboard analytics (WS-1.6). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = await getUser(req);
    const orgId = assertOrgScope(user, url.searchParams.get("orgId"));
    const [m, a] = await Promise.all([meters(orgId), orgAnalytics(orgId)]);
    return Response.json({ meters: m, analytics: a });
  } catch (err) {
    return errorResponse(err);
  }
}
