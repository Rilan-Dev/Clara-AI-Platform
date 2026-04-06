import { NextRequest } from "next/server";
import { createOrgHandler, listOrgsHandler } from "@/modules/organisations/api/orgs";

export async function GET(req: NextRequest) {
  return listOrgsHandler(req);
}

export async function POST(req: NextRequest) {
  return createOrgHandler(req);
}
