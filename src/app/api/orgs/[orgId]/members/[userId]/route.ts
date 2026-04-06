import { NextRequest } from "next/server";
import { removeOrgMemberHandler } from "@/modules/auth/api/auth";
type Params = { params: Promise<{ orgId: string; userId: string }> };
export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId, userId } = await params;
  return removeOrgMemberHandler(req, orgId, userId);
}
