import { NextRequest } from "next/server";
import { removeOrgMemberHandler, updateOrgMemberRoleHandler } from "@/modules/auth/api/auth";
type Params = { params: Promise<{ orgId: string; userId: string }> };
export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId, userId } = await params;
  return removeOrgMemberHandler(req, orgId, userId);
}
export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId, userId } = await params;
  return updateOrgMemberRoleHandler(req, orgId, userId);
}
