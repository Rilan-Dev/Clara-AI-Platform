import { NextRequest, NextResponse } from "next/server";
import { getOpenAICatalogCached } from "@/modules/assistant/api/openai-catalog-cache";

/**
 * GET /api/ai/openai/catalog[?refresh=1]
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves the OpenAI capability catalog (realtime models + voices) through the
 * Redis cache — repeated visits cost a Redis read instead of an OpenAI
 * round-trip. `?refresh=1` bypasses and repopulates the cache (used by the
 * "Refresh" affordance in the Voice tab).
 *
 * Response envelope adds `cache.status` / `cache.cachedAt` / `cache.ttlSeconds`
 * and an `X-Cache` header so the UI can show provenance without guessing.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const { catalog, cache, cachedAt, ttlSeconds } = await getOpenAICatalogCached(apiKey, { refresh });
    return NextResponse.json(
      {
        ...catalog,
        cache: { status: cache, cachedAt: cachedAt ?? null, ttlSeconds: ttlSeconds ?? null },
      },
      {
        headers: {
          "X-Cache": cache,
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[openai/catalog]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to discover OpenAI capabilities" },
      { status: 502 },
    );
  }
}
