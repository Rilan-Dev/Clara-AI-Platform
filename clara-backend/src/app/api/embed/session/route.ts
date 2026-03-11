/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session  (CORS preflight)
 * ─────────────────────────────────────────────────────────────────────────────
 * Public voice session endpoint — authenticated by API key.
 * Creates an OpenAI Realtime session configured from the KB's AssistantConfig.
 * Equivalent to /api/realtime/session but open to external callers via API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Voice not configured" }, { status: 500, headers: corsHeaders });
    }

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const instructions = buildSystemPrompt(config, { kbName: kb.name });

    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-mini-realtime-preview",
        voice: config.voiceId,
        modalities: ["audio", "text"],
        instructions,
        temperature: config.temperature,
        max_response_output_tokens: config.maxTokens,
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: false,
        },
        input_audio_transcription: {
          model: "gpt-4o-transcribe",
          language: config.alwaysRespondIn ?? config.defaultLanguage,
        },
        tools: [
          {
            type: "function",
            name: "rag_search",
            description: `Search the "${kb.name}" knowledge base for relevant information.`,
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "User question in natural language" },
              },
              required: ["query"],
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 500, headers: corsHeaders });
    }

    const session = await res.json();
    return NextResponse.json({ ...session, kbId: ctx.kbId }, { headers: corsHeaders });
  } catch (err) {
    console.error("[embed/session]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
