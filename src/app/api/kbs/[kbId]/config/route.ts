import { NextRequest } from "next/server";
import { getConfigHandler, putConfigHandler, patchConfigHandler } from "@/modules/knowledge-bases/api/config";
import { requireAuth, requireTenantScope } from "@/modules/auth/core/rbac";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return getConfigHandler(req,kbId);}
export async function PUT(req: NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return putConfigHandler(req,kbId);}
export async function PATCH(req: NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return patchConfigHandler(req,kbId);}
