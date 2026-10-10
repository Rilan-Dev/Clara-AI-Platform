import { errorResponse } from "@/lib/api-contract";
import { requireOrgUser, getUser, assertOrgScope } from "@/lib/session";
import { meters } from "@/lib/usage";

export const dynamic = "force-dynamic";

/** GET /api/meters?orgId= — live meters for dashboards (polled, SWR-style). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requested = url.searchParams.get("orgId");
    const user = await getUser(req);
    const orgId = assertOrgScope(user, requested);
    return Response.json(await meters(orgId));
  } catch (err) {
    return errorResponse(err);
  }
}

// requireOrgUser kept for parity on POST paths if added later
void requireOrgUser;
