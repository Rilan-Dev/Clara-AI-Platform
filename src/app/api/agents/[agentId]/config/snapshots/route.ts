import { NextRequest } from "next/server";
import {
  listSnapshotsHandler,
  createSnapshotHandler,
} from "@/modules/knowledge-bases/api/agent-snapshots";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return listSnapshotsHandler(req, agentId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return createSnapshotHandler(req, agentId);
}
