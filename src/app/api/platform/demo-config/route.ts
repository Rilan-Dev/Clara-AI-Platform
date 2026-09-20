import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { resolveLandingEmbedKey } from "@/modules/admin/core/embed-api-key-db";

export const dynamic = "force-dynamic";

/**
 * Landing-demo embed credential — resolves through the SAME shared resolver
 * as /api/embed/demo-config (admin-managed platform setting first, env var
 * second, legacy seeded key last) so the two endpoints can never disagree
 * about which key — and therefore which KB — the demo renders.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { key, source } = await resolveLandingEmbedKey();
    return NextResponse.json(
      { key, source },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[platform/demo-config] failed to load landing embed configuration", error);
    return NextResponse.json(
      { key: process.env.NEXT_PUBLIC_LANDING_EMBED_API_KEY?.trim() || "", source: "env" as const },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
