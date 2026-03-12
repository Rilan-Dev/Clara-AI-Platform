import { NextRequest } from "next/server";
import {
  getOrgAISettingsHandler,
  patchOrgAISettingsHandler,
} from "@/modules/organisations/api/ai-settings";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(
  req: NextRequest,
  { params }: Params,
) {
  const { orgId } = await params;
  return getOrgAISettingsHandler(req, orgId);
}

export async function PATCH(
  req: NextRequest,
  { params }: Params,
) {
  const { orgId } = await params;
  return patchOrgAISettingsHandler(req, orgId);
}
