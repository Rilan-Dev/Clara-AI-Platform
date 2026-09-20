import { NextRequest } from "next/server";
import {
  createKbHandler,
  listKbsHandler,
} from "@/modules/knowledge-bases/api/kbs";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return listKbsHandler(req, agentId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return createKbHandler(req, agentId);
}
