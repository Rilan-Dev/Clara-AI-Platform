import { NextRequest } from "next/server";
import {
  getProjectAISettingsHandler,
  patchProjectAISettingsHandler,
} from "@/modules/organisations/api/project-ai-settings";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return getProjectAISettingsHandler(req, projectId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return patchProjectAISettingsHandler(req, projectId);
}
