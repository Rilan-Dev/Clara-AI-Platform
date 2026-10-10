import { errorResponse } from "@/lib/api-contract";
import { requirePlatformAdmin } from "@/lib/session";
import { adminAnalytics } from "@/lib/usage";

export const dynamic = "force-dynamic";

/** GET /api/analytics/admin — platform-admin cross-org analytics (WS-1.6). */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin(req);
    return Response.json(await adminAnalytics());
  } catch (err) {
    return errorResponse(err);
  }
}
