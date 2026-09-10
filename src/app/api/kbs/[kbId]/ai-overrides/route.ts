import { NextRequest } from "next/server";
import { getKBAIOverridesHandler, patchKBAIOverridesHandler } from "@/modules/knowledge-bases/api/ai-overrides";
import { requireAuth, requireTenantScope } from "@/modules/auth/core/rbac";

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req:NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return getKBAIOverridesHandler(req,kbId);}
export async function PATCH(req:NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return patchKBAIOverridesHandler(req,kbId);}
