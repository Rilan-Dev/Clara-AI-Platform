import { NextRequest } from "next/server";
import {
  listSnapshotsHandler,
  createSnapshotHandler,
} from "@/modules/knowledge-bases/api/snapshots";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return listSnapshotsHandler(req, kbId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return createSnapshotHandler(req, kbId);
}
