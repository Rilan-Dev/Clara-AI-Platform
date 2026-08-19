/**
 * POST /api/embed/session
 * OPTIONS /api/embed/session
 *
 * Public embed voice-session endpoint. The embed key resolves the KB and its
 * owning organisation first; AI provider/model/voice/limits are then resolved
 * through the shared tenant-aware AI resolver. Secrets remain server-side.
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
import {
  buildOpenAIRealtimeSession,
  createOpenAIRealtimeClientSecret,
} from "@/modules/assistant/api/openai-realtime";
import { getRealtimeAudioPolicy } from "@/modules/assistant/core/voice/realtime-audio-config";

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
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const [kb, config, resolved] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
      resolveAIConfig({ kbId: ctx.kbId, surface: "embed" }),
    ]);

    if (!kb || !config) {
      return NextResponse.json(
        { error: "Knowledge-base configuration not found", kbId: ctx.kbId },
        { status: 404, headers: corsHeaders },
      );
    }

    const instructions = buildSystemPrompt(config, { kbName: kb.name, surface: "realtime" });
    const apiKey = getProviderApiKey(resolved.provider);
    const audioPolicy = getRealtimeAudioPolicy();

    console.info("[embed/session] tenant configuration", {
      orgId: resolved.orgId,
      kbId: resolved.kbId,
      provider: resolved.provider,
      providerSource: resolved.sources.provider,
      realtimeModel: resolved.realtimeModel,
      realtimeModelSource: resolved.sources.realtimeModel,
      voiceId: resolved.voiceId,
      voiceSource: resolved.sources.voiceId,
      transcriptionModel: resolved.transcriptionModel,
      transcriptionSource: resolved.sources.transcriptionModel,
      maxTokens: resolved.maxTokens,
      maxTokensSource: resolved.sources.maxTokens,
      temperature: resolved.temperature,
      temperatureSource: resolved.sources.temperature,
      audioPolicy,
      flags: resolved.flags,
      apiKeyConfigured: Boolean(apiKey),
    });

    if (!apiKey) {
      const envName = resolved.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
      return NextResponse.json(
        { error: `${resolved.provider} is selected for this tenant, but ${envName} is not configured on the server.` },
        { status: 503, headers: corsHeaders },
      );
    }

    if (resolved.provider === "gemini") {
      if (!resolved.realtimeModel) {
        return NextResponse.json(
          { error: "Gemini realtime model is not configured for this tenant." },
          { status: 503, headers: corsHeaders },
        );
      }

      const model = resolved.realtimeModel.startsWith("models/")
        ? resolved.realtimeModel
        : `models/${resolved.realtimeModel}`;

      return NextResponse.json(
        {
          provider: "gemini",
          kbId: ctx.kbId,
          wsUrl: `${GEMINI_LIVE_WSS_URL}?key=${apiKey}`,
          model,
          voice: resolved.voiceId,
          instructions,
          inputSampleRate: GEMINI_INPUT_SAMPLE_RATE,
          outputSampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
          welcomeMessage: config.welcomeMessage ?? "",
          audioPolicy,
          config: {
            orgId: resolved.orgId,
            provider: resolved.provider,
            realtimeModel: resolved.realtimeModel,
            voiceId: resolved.voiceId,
            transcriptionModel: resolved.transcriptionModel,
            maxTokens: resolved.maxTokens,
            temperature: resolved.temperature,
          },
        },
        { headers: corsHeaders },
      );
    }

    if (!resolved.realtimeModel) {
      return NextResponse.json(
        { error: "OpenAI realtime model is not configured for this tenant." },
        { status: 503, headers: corsHeaders },
      );
    }

    const turnDetection = {
      type: "server_vad" as const,
      threshold: audioPolicy.vadThreshold,
      prefix_padding_ms: audioPolicy.prefixPaddingMs,
      silence_duration_ms: audioPolicy.silenceDurationMs,
      create_response: false,
      interrupt_response: false,
    };

    const transcription = resolved.transcriptionModel
      ? {
          model: resolved.transcriptionModel,
          language: config.alwaysRespondIn ?? config.defaultLanguage,
        }
      : undefined;

    const realtimeMaxOutputTokens = resolved.maxTokens;

    const realtimeSession = buildOpenAIRealtimeSession({
      model: resolved.realtimeModel,
      voice: resolved.voiceId ?? undefined,
      instructions,
      maxOutputTokens: realtimeMaxOutputTokens ?? undefined,
      turnDetection,
      transcription,
      tools: [],
      toolChoice: "none",
    });

    const result = await createOpenAIRealtimeClientSecret({ apiKey, session: realtimeSession });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: `OpenAI Realtime session creation failed (${result.status})`,
          details: result.errorText,
          model: resolved.realtimeModel,
          orgId: resolved.orgId,
          kbId: resolved.kbId,
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
        model: resolved.realtimeModel,
        voice: resolved.voiceId,
        max_output_tokens: realtimeMaxOutputTokens,
        turn_detection: turnDetection,
        input_audio_transcription: transcription,
        audio_policy: audioPolicy,
        kbId: resolved.kbId,
        orgId: resolved.orgId,
        provider: resolved.provider,
        welcomeMessage: config.welcomeMessage ?? "",
        config: {
          orgId: resolved.orgId,
          provider: resolved.provider,
          realtimeModel: resolved.realtimeModel,
          voiceId: resolved.voiceId,
          transcriptionModel: resolved.transcriptionModel,
          maxTokens: resolved.maxTokens,
          temperature: resolved.temperature,
          sources: resolved.sources,
          flags: resolved.flags,
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
