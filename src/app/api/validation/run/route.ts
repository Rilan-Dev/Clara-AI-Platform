import { errorResponse } from "@/lib/api-contract";
import { runValidationSuite } from "@/lib/validation-suite";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/validation/run — execute the plan-by-plan quota suite (WS-1.3). */
export async function POST(req: Request) {
  try {
    // platform-admin only, like every audit-adjacent surface
    const { requirePlatformAdmin } = await import("@/lib/session");
    await requirePlatformAdmin(req);
    const result = await runValidationSuite();
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET /api/validation/run — latest runs. */
export async function GET() {
  try {
    const { latestRuns, PLAN_TIERS } = await import("@/lib/validation-suite");
    return Response.json({ runs: await latestRuns(), tiers: PLAN_TIERS });
  } catch (err) {
    return errorResponse(err);
  }
}
