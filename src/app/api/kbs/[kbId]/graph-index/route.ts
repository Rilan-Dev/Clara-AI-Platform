import { NextRequest } from "next/server";
import { getKbGraphIndexHandler } from "@/modules/knowledge-bases/api/graph-index";
type Params={params:Promise<{kbId:string}>};
export async function GET(req:NextRequest,{params}:Params){
  const {kbId}=await params;
  return getKbGraphIndexHandler(req,kbId);
}
