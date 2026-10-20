import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";

import { listDocuments } from "@/modules/admin/core";

export async function getDocuments(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    await requireSuperAdmin(auth);
    const documents = await listDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Failed to list documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
