import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { describeRuntimeFlags } from "@/lib/runtime-flags";

/** GET /api/platform/runtime-flags — read-only effective env switches (super admin). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    return NextResponse.json({ groups: describeRuntimeFlags() });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
