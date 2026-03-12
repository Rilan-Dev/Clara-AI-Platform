import { NextRequest } from "next/server";
import {
  getKBAIOverridesHandler,
  patchKBAIOverridesHandler,
} from "@/modules/knowledge-bases/api/ai-overrides";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(
  req: NextRequest,
  { params }: Params,
) {
  const { kbId } = await params;
  return getKBAIOverridesHandler(req, kbId);
}

export async function PATCH(
  req: NextRequest,
  { params }: Params,
) {
  const { kbId } = await params;
  return patchKBAIOverridesHandler(req, kbId);
}
