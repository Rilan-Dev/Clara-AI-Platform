import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getEmbedApiKey } from "@/modules/admin/core/embed-api-key-db";

export const dynamic = "force-dynamic";

/**
 * The landing page is a client component, so it cannot read the server-only
 * platform settings module directly. Return only the public embed credential
 * needed to construct the embedded voice/chat demo URLs.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const key = await getEmbedApiKey() || process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() || "";

    return NextResponse.json(
      { key },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[embed/demo-config] failed to load demo configuration", error);
    return NextResponse.json(
      { key: "", error: "Demo configuration unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
