import { NextRequest, NextResponse } from "next/server";

import { getDocumentById, listDocuments } from "@/modules/admin/core";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

export async function getPolicies(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);
    const policies = await listDocuments();
    return NextResponse.json({ policies });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function getPolicyById(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const { id } = await context.params;
    const policy = await getDocumentById(id);
    if (!policy) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
