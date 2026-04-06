import { NextRequest } from "next/server";
import {
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
} from "@/modules/organisations/api/projects";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return getProjectHandler(req, projectId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return updateProjectHandler(req, projectId);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return deleteProjectHandler(req, projectId);
}
