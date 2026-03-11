import { NextRequest, NextResponse } from "next/server";

import { ensureMigrated } from "@/lib/db/migrate";
import { ensureDemoDataSeededOnStartup } from "@/lib/db/demo-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const secret = process.env.LOCAL_INIT_SECRET;
  return Boolean(secret) && req.headers.get("x-clara-init-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await ensureMigrated();
    await ensureDemoDataSeededOnStartup();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[startup] init route failed:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
