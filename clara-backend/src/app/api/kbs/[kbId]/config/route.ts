import { NextRequest } from "next/server";
import {
  getConfigHandler,
  putConfigHandler,
  patchConfigHandler,
} from "@/modules/knowledge-bases/api/config";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return getConfigHandler(req, kbId);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return putConfigHandler(req, kbId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return patchConfigHandler(req, kbId);
}
