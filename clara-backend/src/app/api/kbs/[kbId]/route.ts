import { NextRequest } from "next/server";
import {
  getKbHandler,
  updateKbHandler,
  deleteKbHandler,
} from "@/modules/knowledge-bases/api/kbs";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return getKbHandler(req, kbId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return updateKbHandler(req, kbId);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return deleteKbHandler(req, kbId);
}
