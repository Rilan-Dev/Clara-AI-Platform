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
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";

const GEMINI_LIVE_WSS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

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

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name });

    if (resolved.provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Gemini voice is not configured" },
          { status: 500, headers: corsHeaders },
        );
      }

      const rawModel = resolved.realtimeModel ?? process.env.GEMINI_LIVE_MODEL ?? "gemini-2.5-flash-native-audio-preview-12-2025";
      const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
      const wsUrl = `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`;

      return NextResponse.json(
        {
          provider: "gemini",
          kbId: ctx.kbId,
          wsUrl,
          model,
          voice: resolved.voiceId ?? process.env.GEMINI_LIVE_VOICE ?? "Aoede",
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
        },
        { headers: corsHeaders },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Voice not configured" }, { status: 500, headers: corsHeaders });
    }

    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        model: resolved.realtimeModel ?? (process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini"),
        voice: resolved.voiceId ?? config.voiceId,
        modalities: ["audio", "text"],
        instructions,
        temperature: resolved.temperature ?? config.temperature,
        max_response_output_tokens: resolved.maxTokens ?? config.maxTokens,
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: false,
        },
        input_audio_transcription: {
          model: resolved.transcriptionModel ?? "gpt-4o-mini-transcribe",
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
    return NextResponse.json(
      { ...session, kbId: ctx.kbId, provider: "openai" },
      { headers: corsHeaders },
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/session]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
