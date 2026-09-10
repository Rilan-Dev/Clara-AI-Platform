import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";

export const dynamic = "force-dynamic";

/**
 * The landing page is a client component, so it cannot read the server-only
 * platform settings module directly. Return only the public embed credential
 * needed to construct the embedded voice/chat demo URLs.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const settings = await getPlatformEnvSettings();
    const configured = settings.find((setting) => setting.key === "DEMO_CLARA_API_KEY")?.value?.trim();
    const key = configured || process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() || process.env.NEXT_PUBLIC_CLARA_EMBED_API_KEY?.trim() || "";

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
