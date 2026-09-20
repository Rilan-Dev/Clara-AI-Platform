import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { resolveLandingEmbedKey } from "@/modules/admin/core/embed-api-key-db";

export const dynamic = "force-dynamic";

/**
 * The landing page is a client component, so it cannot read the server-only
 * platform settings module directly. Return only the public embed credential
 * needed to construct the embedded voice/chat demo URLs.
 *
 * The credential is resolved by resolveLandingEmbedKey(): the platform
 * admin's NEXT_PUBLIC_LANDING_EMBED_API_KEY setting FIRST, deployment env
 * second, and the legacy seeded embed_api_key row as a last resort — so the
 * landing demo always renders the KB the admin pointed the setting at, never
 * static demo data. `source` in the response makes the origin observable
 * straight from the browser network tab.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { key, source } = await resolveLandingEmbedKey();

    if (source === "legacy_key") {
      console.warn(
        "[embed/demo-config] NEXT_PUBLIC_LANDING_EMBED_API_KEY is not configured — serving the legacy embed_api_key row. Set the landing embed key in Settings → Embed to control which KB the demo renders.",
      );
    }

    return NextResponse.json(
      { key, source },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[embed/demo-config] failed to load demo configuration", error);
    return NextResponse.json(
      { key: "", source: null, error: "Demo configuration unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
