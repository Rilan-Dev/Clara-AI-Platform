import { NextResponse } from "next/server";

import { listDocuments } from "@/modules/admin/core";

export async function getDocuments() {
  try {
    const documents = await listDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Failed to list documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
