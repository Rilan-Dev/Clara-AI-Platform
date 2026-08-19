/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session
 *
 * Public embed voice-session endpoint. Demo traffic uses the Platform Admin
 * demo provider configuration and does not require a tenant/project AI record.
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
import {
  AIConfigResolutionError,
  getProviderApiKey,
  resolveAIConfig,
} from "@/modules/ai-core/resolve";
import { getDemoAIConfig } from "@/modules/ai-core/demo-config";
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
} from "@/modules/assistant/api/openai-realtime";
import { getRealtimeAudioPolicy } from "@/modules/assistant/core/voice/realtime-audio-config";

const GEMINI_LIVE_WSS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

function isDemoRequest(req: NextRequest): boolean {
  return (req.headers.get("authorization") ?? "").trim() === "Bearer DEMO_MODE";
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
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json(
        { error: "Knowledge-base configuration not found", kbId: ctx.kbId },
        { status: 404, headers: corsHeaders },
      );
    }

    const isDemo = isDemoRequest(req);
    const demoConfig = isDemo ? await getDemoAIConfig() : null;
    if (isDemo && !demoConfig) {
      return NextResponse.json(
        { error: "Demo AI provider is not configured. Configure the provider and API key in Platform Admin → Demo." },
        { status: 503, headers: corsHeaders },
      );
    }

    const resolved = isDemo ? null : await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const provider = isDemo ? demoConfig!.provider : resolved!.provider;
    const realtimeModel = isDemo ? demoConfig!.realtimeModel : resolved!.realtimeModel;
    const voiceId = isDemo ? demoConfig!.voiceId : resolved!.voiceId;
    const transcriptionModel = isDemo
      ? demoConfig!.transcriptionModel
      : resolved!.transcriptionModel;
    const allowedLanguages = isDemo
      ? (config.allowedLanguages ?? [config.defaultLanguage ?? "en"])
      : resolved!.allowedLanguages;
    const defaultLanguage = isDemo
      ? config.alwaysRespondIn ?? config.defaultLanguage ?? allowedLanguages[0] ?? "en"
      : resolved!.defaultLanguage;
    const maxTokens = isDemo ? config.maxTokens : resolved!.maxTokens;
    const temperature = isDemo ? config.temperature : resolved!.temperature;
    const apiKey = isDemo
      ? demoConfig!.apiKey
      : getProviderApiKey(resolved!.provider);
    const audioPolicy = getRealtimeAudioPolicy();

    if (!apiKey) {
      const envName = provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
      return NextResponse.json(
        { error: `${provider} is selected for this tenant, but ${envName} is not configured on the server.` },
        { status: 503, headers: corsHeaders },
      );
    }

    if (provider === "gemini") {
      if (!realtimeModel) {
        return NextResponse.json(
          { error: "Gemini realtime model is not configured for the Demo." },
          { status: 503, headers: corsHeaders },
        );
      }

      const model = realtimeModel.startsWith("models/") ? realtimeModel : `models/${realtimeModel}`;
      const instructions = buildSystemPrompt(config, {
        kbName: kb.name,
        surface: "realtime",
        allowedLanguages,
      });

      return NextResponse.json(
        {
          provider: "gemini",
          kbId: ctx.kbId,
          wsUrl: `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`,
          model,
          voice: voiceId,
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
          welcomeMessage: config.welcomeMessage ?? "",
          audioPolicy,
          config: {
            orgId: resolved?.orgId ?? ctx.orgId,
            provider,
            realtimeModel,
            voiceId,
            transcriptionModel,
            maxTokens,
            temperature,
          },
        },
        { headers: corsHeaders },
      );
    }

    if (!realtimeModel) {
      return NextResponse.json(
        { error: "OpenAI realtime model is not configured for this tenant." },
        { status: 503, headers: corsHeaders },
      );
    }
    if (!voiceId) {
      return NextResponse.json(
        { error: "OpenAI realtime voice is not configured for this tenant." },
        { status: 503, headers: corsHeaders },
      );
    }

    const instructions = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "realtime",
      allowedLanguages,
    });

    const turnDetection = {
      type: "server_vad" as const,
      threshold: audioPolicy.vadThreshold,
      prefix_padding_ms: audioPolicy.prefixPaddingMs,
      silence_duration_ms: audioPolicy.silenceDurationMs,
      create_response: false,
      interrupt_response: false,
    };

    const transcription = transcriptionModel
      ? {
          model: transcriptionModel,
          language: defaultLanguage ?? undefined,
        }
      : undefined;

    const realtimeSession = buildOpenAIRealtimeSession({
      model: realtimeModel,
      voice: voiceId,
      instructions,
      maxOutputTokens: maxTokens ?? undefined,
      turnDetection,
      transcription,
      tools: [],
      toolChoice: "none",
    });

    const result = await createOpenAIRealtimeClientSecret({ apiKey, session: realtimeSession });

    if (!result.ok) {
      console.error("[embed/session] OpenAI Realtime session creation failed", {
        status: result.status,
        provider,
        model: realtimeModel,
        demo: isDemo,
      });
      return NextResponse.json(
        {
          error: `OpenAI Realtime session creation failed (${result.status})`,
          details: result.errorText,
          model: realtimeModel,
          orgId: resolved?.orgId ?? ctx.orgId,
          kbId: ctx.kbId,
        },
        {
          status: result.status >= 400 && result.status < 600 ? result.status : 502,
          headers: corsHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        ...result.data,
        model: realtimeModel,
        voice: voiceId,
        max_output_tokens: maxTokens,
        turn_detection: turnDetection,
        input_audio_transcription: transcription,
        audio_policy: audioPolicy,
        kbId: ctx.kbId,
        orgId: resolved?.orgId ?? ctx.orgId,
        provider,
        welcomeMessage: config.welcomeMessage ?? "",
        config: {
          orgId: resolved?.orgId ?? ctx.orgId,
          provider,
          realtimeModel,
          voiceId,
          transcriptionModel,
          maxTokens,
          temperature,
          sources: resolved?.sources,
          flags: resolved?.flags,
        },
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
