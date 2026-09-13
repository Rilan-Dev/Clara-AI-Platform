import { NextRequest } from "next/server";
import { getKBAIOverridesHandler, patchKBAIOverridesHandler } from "@/modules/knowledge-bases/api/ai-overrides";

type Params = { params: Promise<{ kbId: string }> };

// Auth, tenant-scope and permission checks all live inside the handlers
// (they wrap everything in try/catch so RBAC errors return clean 401/403
// JSON instead of an unhandled 500).
export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return getKBAIOverridesHandler(req, kbId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return patchKBAIOverridesHandler(req, kbId);
}
