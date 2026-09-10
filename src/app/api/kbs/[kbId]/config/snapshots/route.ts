import { NextRequest } from "next/server";
import { listSnapshotsHandler, createSnapshotHandler } from "@/modules/knowledge-bases/api/snapshots";
import { requireAuth, requireTenantScope } from "@/modules/auth/core/rbac";
type Params={params:Promise<{kbId:string}>};
export async function GET(req:NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return listSnapshotsHandler(req,kbId);}
export async function POST(req:NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return createSnapshotHandler(req,kbId);}
