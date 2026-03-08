import { NextRequest } from "next/server";
import { restoreSnapshotHandler } from "@/modules/knowledge-bases/api/snapshots";

type Params = { params: Promise<{ kbId: string; snapshotId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { kbId, snapshotId } = await params;
  return restoreSnapshotHandler(req, kbId, snapshotId);
}
