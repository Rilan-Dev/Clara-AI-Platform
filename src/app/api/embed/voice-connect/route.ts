/**
 * POST /api/embed/voice-connect
 * Secure WebRTC SDP proxy for the public embed voice experience.
 * The browser never receives an OpenAI API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { policyFromResolvedConfig, speechRecognitionLanguage } from "@/modules/assistant/core/language-policy";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, requireVoiceAccess, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, getProviderApiKey, resolveAIConfig } from "@/modules/ai-core/resolve";
import { resolveVoiceConfig, VoiceConfigResolutionError } from "@/modules/voice-core/resolve";
import { buildOpenAIRealtimeSession, exchangeOpenAIRealtimeSdp } from "@/modules/assistant/api/openai-realtime";
import { isSupportedOpenAIRealtimeVoice } from "@/modules/assistant/api/openai-catalog";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let corsHeaders: Record<string, string> = {};
  try {
    await ensureMigrated();
    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;
    const origin = req.headers.get("origin");
    corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);

    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const body = (await req.json()) as { sdpOffer?: string };
    if (!body.sdpOffer?.trim()) {
      return NextResponse.json({ error: "sdpOffer is required" }, { status: 400, headers: corsHeaders });
    }

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfigByKb(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    // Public embed voice always uses the real tenant configuration. There is no
    // DEMO_MODE branch here: provider/model/voice/language are resolved through
    // project -> organisation -> platform defaults.
    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "realtime" });
    const voiceResolved = await resolveVoiceConfig({ kbId: ctx.kbId, surface: "realtime" });
    const provider = voiceResolved.realtimeProvider;

    if (provider !== "openai") {
      return NextResponse.json(
        {
          error: `Public WebRTC voice currently requires OpenAI as the realtime transport. The configured realtime provider is ${provider}.`,
          provider,
        },
        { status: 409, headers: corsHeaders },
      );
    }

    const model = voiceResolved.openai?.realtimeModel ?? null;
    const voice = voiceResolved.openai?.voiceId ?? null;
    const transcriptionModel =
      voiceResolved.openai?.transcriptionModel ?? null;
    const allowedLanguages = resolved.allowedLanguages;
    // Recognition language under the language policy (null = auto-detect).
    const language = speechRecognitionLanguage(policyFromResolvedConfig(resolved)) ?? undefined;
    // Realtime cap (org / platform), not the chat-length maxTokens.
    const maxTokens: number | "inf" = resolved.realtimeMaxOutputTokens ?? "inf";
    const apiKey = getProviderApiKey("openai");

    if (!model) return NextResponse.json({ error: "No realtime model is configured for this tenant." }, { status: 400, headers: corsHeaders });
    if (!voice) return NextResponse.json({ error: "No realtime voice is configured for this tenant." }, { status: 400, headers: corsHeaders });
    if (!isSupportedOpenAIRealtimeVoice(voice)) {
      return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400, headers: corsHeaders });
    }
    if (!language) {
      return NextResponse.json({ error: "No enabled language is configured for this project." }, { status: 400, headers: corsHeaders });
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: "Voice is not configured on the server: OPENAI_API_KEY is missing." },
        { status: 503, headers: corsHeaders },
      );
    }

    console.info("[embed/voice-connect] runtime configuration", {
      orgId: resolved.orgId ?? ctx.orgId,
      projectId: resolved.agentId,
      kbId: ctx.kbId,
      provider,
      realtimeModel: model,
      transcriptionModel,
      voice,
      allowedLanguages,
      defaultLanguage: language,
      sources: resolved.sources,
    });

    const instructions = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "realtime",
      allowedLanguages,
    });

    const realtimeSession = buildOpenAIRealtimeSession({
      model,
      voice,
      instructions,
      maxOutputTokens: maxTokens,
      turnDetection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 600,
        create_response: false,
      },
      transcription: transcriptionModel ? { model: transcriptionModel, language } : undefined,
      tools: [{
        type: "function",
        name: "rag_search",
        description: `Search the "${kb.name}" knowledge base for relevant information.`,
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      }],
      toolChoice: "auto",
    });

    const sdpResult = await exchangeOpenAIRealtimeSdp({
      apiKey,
      sdpOffer: body.sdpOffer,
      session: realtimeSession,
    });

    if (!sdpResult.ok) {
      console.error("[embed/voice-connect] SDP exchange failed", {
        status: sdpResult.status,
        model,
        voice,
      });
      return NextResponse.json(
        {
          error: `SDP exchange failed (${sdpResult.status})`,
          details: sdpResult.errorText,
          model,
          voice,
          orgId: resolved.orgId ?? ctx.orgId,
          projectId: resolved.agentId,
          kbId: ctx.kbId,
        },
        { status: sdpResult.status >= 400 && sdpResult.status < 600 ? sdpResult.status : 502, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        sdpAnswer: String(sdpResult.data.sdpAnswer ?? ""),
        welcomeMessage: config.welcomeMessage ?? "",
        provider,
        model,
        voice,
        transcriptionModel,
        kbId: ctx.kbId,
        orgId: resolved.orgId ?? ctx.orgId,
        projectId: resolved.agentId,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    if (err instanceof VoiceConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
    console.error("[embed/voice-connect]:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500, headers: corsHeaders });
  }
}
