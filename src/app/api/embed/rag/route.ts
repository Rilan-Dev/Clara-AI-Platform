import { NextRequest, NextResponse } from "next/server";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { postRagSearch } from "@/modules/assistant/api/rag";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import type { ProviderConfig } from "@/modules/ai-core/types";

function setting(
  settings: Awaited<ReturnType<typeof getPlatformEnvSettings>>,
  key: string,
): string {
  return settings.find((s) => s.key === key)?.value?.trim() ?? "";
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const validation = await validateEmbedRequest(req);
  if (!validation.ok) return validation.response;

  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin, validation.ctx.allowedOrigins, req.nextUrl.origin);
  const authHeader = req.headers.get("authorization") ?? "";
  const isDemo = authHeader.trim() === "Bearer DEMO_MODE";

  try {
    const body = await req.json();
    body.kbId = validation.ctx.kbId;

    // Demo RAG must use the same Platform Admin -> Demo provider as Demo chat
    // and voice. Previously this endpoint resolved the KB's normal AI policy,
    // which could silently route a Demo voice turn to Gemini even when Demo was
    // configured for OpenAI. That produced Gemini model 404s and broke voice.
    let providerConfig: ProviderConfig | undefined;
    if (isDemo) {
      const settings = await getPlatformEnvSettings();
      const demoProvider = setting(settings, "DEMO_AI_PROVIDER").toLowerCase() ||
        process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() || "openai";

      if (demoProvider === "openai") {
        const apiKey = setting(settings, "DEMO_OPENAI_API_KEY") ||
          process.env.DEMO_OPENAI_API_KEY?.trim() || "";
        if (!apiKey) {
          return NextResponse.json(
            { error: "Demo OpenAI API key is not configured. Set it in Platform Admin → Demo." },
            { status: 503, headers: corsHeaders },
          );
        }

        const embeddingModel = setting(settings, "DEMO_OPENAI_EMBEDDING_MODEL") ||
          process.env.DEMO_OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
        providerConfig = {
          provider: "openai",
          apiKey,
          chatModel: setting(settings, "DEMO_OPENAI_CHAT_MODEL") ||
            process.env.DEMO_OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
          embeddingModel,
          embeddingDimension: embeddingModel === "text-embedding-3-large" ? 3072 : 1536,
        };
      } else if (demoProvider === "gemini") {
        const apiKey = setting(settings, "DEMO_GEMINI_API_KEY") ||
          process.env.DEMO_GEMINI_API_KEY?.trim() || "";
        if (!apiKey) {
          return NextResponse.json(
            { error: "Demo Gemini API key is not configured. Switch Platform Admin → Demo to OpenAI or configure Gemini." },
            { status: 503, headers: corsHeaders },
          );
        }

        providerConfig = {
          provider: "gemini",
          apiKey,
          chatModel: setting(settings, "DEMO_GEMINI_CHAT_MODEL") ||
            process.env.DEMO_GEMINI_CHAT_MODEL?.trim() || "gemini-3.6-flash",
          embeddingModel: setting(settings, "DEMO_GEMINI_EMBEDDING_MODEL") ||
            process.env.DEMO_GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
          embeddingDimension: 3072,
        };
      } else {
        return NextResponse.json(
          { error: `Unsupported Demo AI provider: ${demoProvider}` },
          { status: 400, headers: corsHeaders },
        );
      }
    }

    const modifiedReq = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    });

    const response = await postRagSearch(modifiedReq, providerConfig);

    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  } catch (err) {
    console.error("[embed/rag]:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Invalid JSON body or internal error" },
      { status: 400, headers: corsHeaders },
    );
  }
}
