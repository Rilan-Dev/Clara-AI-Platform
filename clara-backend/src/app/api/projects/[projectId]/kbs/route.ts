import { NextRequest } from "next/server";
import {
  createKbHandler,
  listKbsHandler,
} from "@/modules/knowledge-bases/api/kbs";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return listKbsHandler(req, projectId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return createKbHandler(req, projectId);
}
