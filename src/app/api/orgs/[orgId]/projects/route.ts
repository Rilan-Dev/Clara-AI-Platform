import { NextRequest } from "next/server";
import {
  createProjectHandler,
  listProjectsHandler,
} from "@/modules/organisations/api/projects";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return listProjectsHandler(req, orgId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return createProjectHandler(req, orgId);
}
