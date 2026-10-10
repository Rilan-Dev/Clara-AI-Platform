import { errorResponse } from "@/lib/api-contract";
import { requirePlatformAdmin } from "@/lib/session";
import { revealAuditRow } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/audit/reveal — platform admins with a recorded justification can
 * reveal redacted originals; the reveal itself is audited as a REVEAL row.
 */
export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin(req);
    const body = (await req.json()) as { id: string; justification: string };
    const result = await revealAuditRow(body.id, admin.id, body.justification);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
