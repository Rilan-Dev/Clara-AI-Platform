import { NextRequest, NextResponse } from "next/server";
import { getProjectById } from "@/modules/organisations/core/db";
import {
  getProjectAISettings,
  upsertProjectAISettings,
} from "../core/project-ai-settings-db";
import type { PatchProjectAISettingsInput } from "../core/project-ai-types";

export async function getProjectAISettingsHandler(
  _req: NextRequest,
  projectId: string,
): Promise<NextResponse> {
  try {
    const project = await getProjectById(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const settings = await getProjectAISettings(projectId);
    return NextResponse.json({
      project: { id: project.id, orgId: project.orgId, name: project.name },
      settings,
    });
  } catch (error) {
    console.error("[project-ai-settings] GET", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function patchProjectAISettingsHandler(
  req: NextRequest,
  projectId: string,
): Promise<NextResponse> {
  try {
    const project = await getProjectById(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const body = (await req.json()) as PatchProjectAISettingsInput;
    const settings = await upsertProjectAISettings(project.id, project.orgId, body);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[project-ai-settings] PATCH", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
