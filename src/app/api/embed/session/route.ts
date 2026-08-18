/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session
 *
 * Public demo voice-session endpoint. Demo traffic is resolved entirely from
 * Platform Admin -> Demo settings; visitors never choose an organisation, KB,
 * provider, model, or voice.
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

function setting(settings: Awaited<ReturnType<typeof getPlatformEnvSettings>>, key: string): string {
  return settings.find((s) => s.key === key)?.value?.trim() ?? "";
}

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
        { status: 404, headers: corsHeaders },
      );
    }

    // Demo is intentionally independent from the KB/org AI policy. This is
    // critical for the public demo: visitors must use Platform Admin -> Demo
    // settings and must not fail because a tenant AI configuration is missing.
    const settings = isDemo ? await getPlatformEnvSettings() : [];
    const demoProviderRaw = setting(settings, "DEMO_AI_PROVIDER").toLowerCase() ||
      process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() || "openai";
    const demoProvider: DemoProvider = demoProviderRaw === "openai" ? "openai" : "gemini";

    const resolved = isDemo ? null : await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name });

    if (isDemo && demoProvider === "gemini") {
      const apiKey = setting(settings, "DEMO_GEMINI_API_KEY") || process.env.DEMO_GEMINI_API_KEY?.trim() || "";
      if (!apiKey) {
        return NextResponse.json(
          { error: "Demo Gemini voice is not configured. Set the provider to OpenAI or configure Gemini in Platform Admin -> Demo." },
          { status: 503, headers: corsHeaders },
        );
      }

      const rawModel = setting(settings, "DEMO_GEMINI_LIVE_MODEL") ||
        process.env.DEMO_GEMINI_LIVE_MODEL?.trim() || "";
      if (!rawModel) {
        return NextResponse.json(
          { error: "Demo Gemini realtime model is not configured. Switch Platform Admin -> Demo to OpenAI or configure a supported Gemini realtime model." },
          { status: 503, headers: corsHeaders },
        );
      }
      const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;
      const voice = setting(settings, "DEMO_GEMINI_LIVE_VOICE") || process.env.DEMO_GEMINI_LIVE_VOICE?.trim() || "Aoede";

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
        { headers: corsHeaders },
      );
    }

    if (isDemo && demoProvider !== "openai") {
      return NextResponse.json(
        { error: `Unsupported Demo AI provider: ${demoProviderRaw}` },
        { status: 400, headers: corsHeaders },
      );
    }

    const apiKey =
      (isDemo ? setting(settings, "DEMO_OPENAI_API_KEY") : "") ||
      (isDemo ? process.env.DEMO_OPENAI_API_KEY?.trim() : process.env.OPENAI_API_KEY?.trim()) ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Demo OpenAI voice is not configured. Set the OpenAI API key in Platform Admin -> Demo." },
        { status: 503, headers: corsHeaders },
      );
    }

    const model = (isDemo ? setting(settings, "DEMO_OPENAI_REALTIME_MODEL") : "") ||
      (isDemo ? process.env.DEMO_OPENAI_REALTIME_MODEL?.trim() : "") ||
      resolved?.realtimeModel || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
    const voice = (isDemo ? setting(settings, "DEMO_OPENAI_VOICE") : "") ||
      (isDemo ? process.env.DEMO_OPENAI_VOICE?.trim() : "") ||
      resolved?.voiceId || config.voiceId || "alloy";
    const transcriptionModel = (isDemo ? setting(settings, "DEMO_OPENAI_TRANSCRIPTION_MODEL") : "") ||
      (isDemo ? process.env.DEMO_OPENAI_TRANSCRIPTION_MODEL?.trim() : "") ||
      resolved?.transcriptionModel || "gpt-4o-mini-transcribe";

    const turnDetection = {
      type: "server_vad" as const,
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 700,
      create_response: false,
    };
    const transcription = {
      model: transcriptionModel,
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
      maxOutputTokens: resolved?.maxTokens ?? config.maxTokens,
      turnDetection,
      transcription,
      tools,
      toolChoice: "auto",
    });

    const result = await createOpenAIRealtimeClientSecret({ apiKey, session: realtimeSession });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: `OpenAI Realtime session creation failed (${result.status})`,
          details: result.errorText,
          model,
        },
        { status: 502, headers: corsHeaders },
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
