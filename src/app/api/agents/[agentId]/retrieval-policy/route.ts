import { NextRequest } from "next/server";
import { getAgentRetrievalHandler, patchAgentRetrievalHandler } from "@/modules/rag/api/retrieval-policy";
type Context = {params:Promise<{agentId:string}>};
export async function GET(req:NextRequest,{params}:Context) {
  return getAgentRetrievalHandler(req,(await params).agentId);
}
export async function PATCH(req:NextRequest,{params}:Context) {
  return patchAgentRetrievalHandler(req,(await params).agentId);
}
