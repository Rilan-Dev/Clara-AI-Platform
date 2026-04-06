import { NextRequest } from "next/server";
import {
  getOrgHandler,
  updateOrgHandler,
  deleteOrgHandler,
} from "@/modules/organisations/api/orgs";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return getOrgHandler(req, orgId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return updateOrgHandler(req, orgId);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return deleteOrgHandler(req, orgId);
}
