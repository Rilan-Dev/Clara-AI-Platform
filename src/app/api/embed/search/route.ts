/**
 * POST /api/embed/search
 * Returns raw KB chunks only — no LLM. Used by voice hook and phone calls.
 * Demo requests use Platform Admin -> Demo provider for embeddings.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import type { ProviderConfig } from "@/modules/ai-core/types";

function setting(settings: Awaited<ReturnType<typeof getPlatformEnvSettings>>, key: string): string {
  return settings.find((s) => s.key === key)?.value?.trim() ?? "";
}

// function demoProviderConfig(settings: Awaited<ReturnType<typeof getPlatformEnvSettings>>): ProviderConfig | null {
//   const provider = setting(settings, "DEMO_AI_PROVIDER").toLowerCase() || process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() || "openai";

//   if (provider === "openai") {
//     const apiKey = setting(settings, "DEMO_OPENAI_API_KEY") || process.env.DEMO_OPENAI_API_KEY?.trim() || "";
//     if (!apiKey) return null;
//     const embeddingModel = setting(settings, "DEMO_OPENAI_EMBEDDING_MODEL") ||
//       process.env.DEMO_OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
//     return {
//       provider: "openai",
//       apiKey,
//       chatModel: setting(settings, "DEMO_OPENAI_CHAT_MODEL") || process.env.DEMO_OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
//       embeddingModel,
//       embeddingDimension: embeddingModel === "text-embedding-3-large" ? 3072 : 1536,
//     };
//   }

//   if (provider === "gemini") {
//     const apiKey = setting(settings, "DEMO_GEMINI_API_KEY") || process.env.DEMO_GEMINI_API_KEY?.trim() || "";
//     if (!apiKey) return null;
//     return {
//       provider: "gemini",
//       apiKey,
//       chatModel: setting(settings, "DEMO_GEMINI_CHAT_MODEL") || process.env.DEMO_GEMINI_CHAT_MODEL?.trim() || "gemini-3.6-flash",
//       embeddingModel: setting(settings, "DEMO_GEMINI_EMBEDDING_MODEL") || process.env.DEMO_GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
//       embeddingDimension: 3072,
//     };
//   }

//   return null;
// }

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let corsHeaders: Record<string, string> = {};
  try {
    await ensureMigrated();

    const isInternal = req.headers.get("x-phone-internal") === "1";
    const internalKbId = req.headers.get("x-kb-id") ?? "";

    let kbId: string;
    let providerOverride: ProviderConfig | undefined;
    // let isDemo = false;

    if (isInternal && internalKbId) {
      kbId = internalKbId;
    } else {
      const validation = await validateEmbedRequest(req);
      if (!validation.ok) return validation.response;
      kbId = validation.ctx.kbId;
      corsHeaders = buildCorsHeaders(req.headers.get("origin"), validation.ctx.allowedOrigins, req.nextUrl.origin);
      // isDemo = (req.headers.get("authorization") ?? "").trim() === "Bearer DEMO_MODE";
    }

    const body = (await req.json()) as { query?: string; limit?: number };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400, headers: corsHeaders });
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 6), 1), 12);
    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404, headers: corsHeaders });
    }

    // if (isDemo) {
    //   const settings = await getPlatformEnvSettings();
    //   providerOverride = demoProviderConfig(settings) ?? undefined;
    //   if (!providerOverride) {
    //     return NextResponse.json(
    //       { error: "Demo AI provider is not configured. Configure the provider and API key in Platform Admin → Demo." },
    //       { status: 503, headers: corsHeaders },
    //     );
    //   }
    // }

    const resolved = providerOverride ? null : await resolveAIConfig({ kbId, surface: "chat" });
    const providerConfig = providerOverride ?? toProviderConfig(resolved!);
    const results = await searchKbEmbedded(kb.qdrantCollection, query, limit, { providerConfig });

    const context = results.map((r, i) => `[S${i + 1}] ${r.title}\n${r.snippet}`).join("\n\n");
    const sources = results.map((r, i) => ({
      index: i + 1,
      id: r.id,
      title: r.title,
      snippet: r.snippet.slice(0, 300),
      score: r.score,
      documentId: r.documentId,
    }));

    return NextResponse.json({ context, sources, kbId }, { headers: corsHeaders });
  } catch (err) {
    console.error("[embed/search]:", err);
    return NextResponse.json({ error: (err as Error).message || "Internal error" }, { status: 500, headers: corsHeaders });
  }
}
