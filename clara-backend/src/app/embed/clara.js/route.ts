/**
 * GET /embed/clara.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves the Clara embeddable widget script with correct headers.
 *
 * Why a route handler instead of just relying on /public?
 *   - Explicit Content-Type: application/javascript (no browser sniff warnings)
 *   - Cache-Control tuned for CDN edge caching (1 hour s-maxage, stale-while-revalidate)
 *   - CORS: allow any origin so the script loads from any third-party website
 *   - Easy to add versioning / integrity hash in the future
 *
 * The source file lives at: public/embed/clara.js
 * (Next.js static serving of /public is still active as a fallback.)
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static"; // pre-render at build time when possible

export async function GET(): Promise<NextResponse> {
  try {
    const filePath = join(process.cwd(), "public", "embed", "clara.js");
    const source   = await readFile(filePath, "utf-8");

    return new NextResponse(source, {
      status: 200,
      headers: {
        // JavaScript MIME type — required so browsers don't block module load
        "Content-Type": "application/javascript; charset=utf-8",

        // Cache for 1 hour on CDN edges; clients revalidate in background (SWR)
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",

        // Allow the script to be loaded from any origin (it's a public widget)
        "Access-Control-Allow-Origin": "*",

        // Prevent MIME-type sniffing
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[embed/clara.js] Failed to read widget file:", err);
    return new NextResponse("// Clara widget unavailable\n", {
      status: 500,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }
}
