import { NextRequest } from "next/server";
import { inviteOrgMemberHandler, listOrgMembersHandler } from "@/modules/auth/api/auth";
type Params = { params: Promise<{ orgId: string }> };
export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return listOrgMembersHandler(req, orgId);
}
export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return inviteOrgMemberHandler(req, orgId);
}
