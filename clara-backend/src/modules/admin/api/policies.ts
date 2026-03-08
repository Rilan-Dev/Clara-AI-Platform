import { NextRequest, NextResponse } from "next/server";

import { getDocumentById, listDocuments } from "@/modules/admin/core";

export async function getPolicies() {
  try {
    const policies = await listDocuments();
    return NextResponse.json({ policies });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function getPolicyById(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const policy = await getDocumentById(id);
    if (!policy) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ policy });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
