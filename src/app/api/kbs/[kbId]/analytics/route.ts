import { NextRequest } from "next/server";
import { getKbAnalyticsHandler } from "@/modules/knowledge-bases/api/analytics";
import { requireAuth, requireTenantScope } from "@/modules/auth/core/rbac";

type Params={params:Promise<{kbId:string}>};
export async function GET(req:NextRequest,{params}:Params){const {kbId}=await params;const auth=await requireAuth(req);requireTenantScope(auth);return getKbAnalyticsHandler(req,kbId);}
