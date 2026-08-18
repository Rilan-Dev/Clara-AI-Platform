/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session  (CORS preflight)
 *
 * Public demo voice-session endpoint. Demo traffic is resolved entirely from
 * Platform Admin → Demo settings; visitors never choose an organisation or KB.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
} from "@/modules/assistant/api/openai-realtime";

const GEMINI_LIVE_WSS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

type DemoProvider = "openai" | "gemini";

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
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);
    const authHeader = req.headers.get("authorization") ?? "";
    const isDemo = authHeader.trim() === "Bearer DEMO_MODE";

    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json(
        { error: "Demo knowledge-base configuration not found", kbId: ctx.kbId },
        { status: 404, headers: corsHeaders }
      );
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name });

    // Demo provider is controlled by Platform Admin → Demo.  This is
    // deliberately independent from the organisation's default AI provider so
    // a broken production OpenAI credential cannot break the public demo.
    const settings = isDemo ? await getPlatformEnvSettings() : [];
    const demoProviderRaw =
      settings.find((s) => s.key === "DEMO_AI_PROVIDER")?.value?.trim().toLowerCase() ||
      process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() ||
      "gemini";
    const demoProvider: DemoProvider = demoProviderRaw === "openai" ? "openai" : "gemini";
    const effectiveProvider: DemoProvider = isDemo ? demoProvider : resolved.provider;

    if (effectiveProvider === "gemini") {
      const apiKey =
        (isDemo ? settings.find((s) => s.key === "DEMO_GEMINI_API_KEY")?.value?.trim() : undefined) ||
        process.env.DEMO_GEMINI_API_KEY?.trim() ||
        process.env.GEMINI_API_KEY?.trim();

      if (!apiKey) {
        return NextResponse.json(
          { error: "Demo Gemini voice is not configured. Set DEMO_GEMINI_API_KEY or configure Gemini in Platform Admin → Demo." },
          { status: 503, headers: corsHeaders }
        );
      }

      const rawModel =
        (isDemo ? settings.find((s) => s.key === "DEMO_GEMINI_LIVE_MODEL")?.value?.trim() : undefined) ||
        process.env.DEMO_GEMINI_LIVE_MODEL?.trim() ||
        resolved.realtimeModel ||
        process.env.GEMINI_LIVE_MODEL ||
        "gemini-2.5-flash-native-audio-preview-12-2025";
      const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
      const voice =
        (isDemo ? settings.find((s) => s.key === "DEMO_GEMINI_LIVE_VOICE")?.value?.trim() : undefined) ||
        process.env.DEMO_GEMINI_LIVE_VOICE?.trim() ||
        resolved.voiceId ||
        process.env.GEMINI_LIVE_VOICE ||
        "Aoede";

      return NextResponse.json(
        {
          provider: "gemini",
          kbId: ctx.kbId,
          wsUrl: `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`,
          model,
          voice,
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
          welcomeMessage: config.welcomeMessage ?? "",
        },
        { headers: corsHeaders }
      );
    }

    const apiKey =
      (isDemo ? settings.find((s) => s.key === "DEMO_OPENAI_API_KEY")?.value?.trim() : undefined) ||
      process.env.DEMO_OPENAI_API_KEY?.trim() ||
      (isDemo ? undefined : process.env.OPENAI_API_KEY?.trim());

    if (!apiKey) {
      return NextResponse.json(
        { error: "Demo OpenAI voice is not configured. Set DEMO_OPENAI_API_KEY in Platform Admin → Demo." },
        { status: 503, headers: corsHeaders }
      );
    }

    const model = resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    const voice = resolved.voiceId ?? config.voiceId;
    const turnDetection = {
      type: "server_vad" as const,
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
      create_response: false,
    };
    const transcription = {
      model: resolved.transcriptionModel ?? "gpt-4o-mini-transcribe",
      language: config.alwaysRespondIn ?? config.defaultLanguage,
    };
    const tools = [
      {
        type: "function" as const,
        name: "rag_search",
        description: `Search the "${kb.name}" knowledge base for relevant information.`,
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "User question in natural language" } },
          required: ["query"],
        },
      },
    ];

    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      maxOutputTokens: resolved.maxTokens ?? config.maxTokens,
      turnDetection,
      transcription,
      tools,
      toolChoice: "auto",
    });

    const result = await createOpenAIRealtimeClientSecret({
      apiKey,
      session: realtimeSession,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `OpenAI Realtime session creation failed (${result.status})`, details: result.errorText },
        { status: 502, headers: corsHeaders }
      );
    }

    const session = result.data;
    return NextResponse.json(
      {
        ...session,
        model,
        voice,
        turn_detection: turnDetection,
        input_audio_transcription: transcription,
        kbId: ctx.kbId,
        provider: "openai",
        welcomeMessage: config.welcomeMessage ?? "",
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/session]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
