import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const setting = (await getPlatformEnvSettings()).find((item) => item.key === "NEXT_PUBLIC_LANDING_EMBED_API_KEY");
    return NextResponse.json(
      { key: setting?.value?.trim() || process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() || "" },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[platform/demo-config] failed to load landing embed configuration", error);
    return NextResponse.json({ key: process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() || "" });
  }
}
