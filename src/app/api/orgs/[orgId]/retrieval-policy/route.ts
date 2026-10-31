import { NextRequest } from "next/server";
import { getOrgRetrievalHandler, patchOrgRetrievalHandler } from "@/modules/rag/api/retrieval-policy";
type Context = {params:Promise<{orgId:string}>};
export async function GET(req:NextRequest,{params}:Context) {
  return getOrgRetrievalHandler(req,(await params).orgId);
}
export async function PATCH(req:NextRequest,{params}:Context) {
  return patchOrgRetrievalHandler(req,(await params).orgId);
}
