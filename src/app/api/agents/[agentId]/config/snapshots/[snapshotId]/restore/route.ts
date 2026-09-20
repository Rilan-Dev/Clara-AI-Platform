import { NextRequest } from "next/server";
import { restoreSnapshotHandler } from "@/modules/knowledge-bases/api/agent-snapshots";

type Params = { params: Promise<{ agentId: string; snapshotId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId, snapshotId } = await params;
  return restoreSnapshotHandler(req, agentId, snapshotId);
}
