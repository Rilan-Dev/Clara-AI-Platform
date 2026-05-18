import { NextResponse } from "next/server";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import { ensureMigrated } from "@/lib/db/migrate";

export async function GET() {
  try {
    await ensureMigrated();
    const settings = await getPlatformEnvSettings();
    const demoKbIdSetting = settings.find(s => s.key === "DEMO_KB_ID");
    const demoKbId = demoKbIdSetting?.value || "30000000-0000-0000-0000-000000000001";
    
    return NextResponse.json({ kbId: demoKbId });
  } catch (error) {
    console.error("[demo-config] Failed to fetch demo config:", error);
    return NextResponse.json({ kbId: "30000000-0000-0000-0000-000000000001" });
  }
}
