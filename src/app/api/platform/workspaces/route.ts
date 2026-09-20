import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { createWorkspace, WorkspaceValidationError, type CreateWorkspaceInput } from "@/modules/organisations/core/workspace";

export const dynamic = "force-dynamic";

async function requirePlatformAdmin(req: NextRequest) {
  const auth = await requireAuth(req);
  await requireSuperAdmin(auth);
  return auth;
}

type WorkspaceRequestBody = Omit<CreateWorkspaceInput, "createdBy">;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requirePlatformAdmin(req);
    const body = (await req.json()) as WorkspaceRequestBody;

    if (!body?.orgName?.trim()) return NextResponse.json({ error: "orgName is required" }, { status: 400 });
    if (!body?.adminEmail?.trim()) return NextResponse.json({ error: "adminEmail is required" }, { status: 400 });
    if (!body?.adminFullName?.trim()) return NextResponse.json({ error: "adminFullName is required" }, { status: 400 });

    const result = await createWorkspace({ ...body, createdBy: auth.user.id });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof WorkspaceValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[POST /api/platform/workspaces]", err);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}
