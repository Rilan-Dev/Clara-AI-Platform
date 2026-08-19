/**
 * POST /api/embed/voice-connect
 * Secure WebRTC SDP proxy for the public Demo voice experience.
 * The browser never receives an OpenAI API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, requireVoiceAccess, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, getProviderApiKey, resolveAIConfig } from "@/modules/ai-core/resolve";
import { getDemoAIConfig } from "@/modules/ai-core/demo-config";
import { buildOpenAIRealtimeSession, exchangeOpenAIRealtimeSdp } from "@/modules/assistant/api/openai-realtime";
import { isSupportedOpenAIRealtimeVoice } from "@/modules/assistant/api/openai-catalog";

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

    const body = (await req.json()) as { sdpOffer?: string };
    if (!body.sdpOffer?.trim()) {
      return NextResponse.json({ error: "sdpOffer is required" }, { status: 400, headers: corsHeaders });
    }

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const isDemo = isDemoRequest(req);
    const demoConfig = isDemo ? await getDemoAIConfig() : null;
    if (isDemo && !demoConfig) {
      return NextResponse.json(
        { error: "Demo AI provider is not configured. Configure the provider and API key in Platform Admin → Demo." },
        { status: 503, headers: corsHeaders },
      );
    }

    const resolved = isDemo ? null : await resolveAIConfig({ kbId: ctx.kbId, surface: "realtime" });
    const provider = isDemo ? demoConfig!.provider : resolved!.provider;
    if (provider !== "openai") {
      return NextResponse.json(
        { error: "Public WebRTC voice currently requires OpenAI. Switch the Demo provider to OpenAI in Platform Admin → Demo." },
        { status: 503, headers: corsHeaders },
      );
    }

    const model = isDemo ? demoConfig!.realtimeModel : resolved!.realtimeModel;
    const voice = isDemo ? demoConfig!.voiceId : resolved!.voiceId;
    const transcriptionModel = isDemo ? demoConfig!.transcriptionModel : resolved!.transcriptionModel;
    const allowedLanguages = isDemo
      ? (config.allowedLanguages ?? [config.defaultLanguage ?? "en"])
      : resolved!.allowedLanguages;
    const language = isDemo
      ? config.alwaysRespondIn ?? config.defaultLanguage ?? allowedLanguages[0] ?? "en"
      : resolved!.defaultLanguage;
    const maxTokens = isDemo ? config.maxTokens ?? 1024 : resolved!.maxTokens ?? config.maxTokens ?? 1024;
    const apiKey = isDemo ? demoConfig!.apiKey : getProviderApiKey("openai");

    if (!model) return NextResponse.json({ error: "No realtime model is configured." }, { status: 400, headers: corsHeaders });
    if (!voice) return NextResponse.json({ error: "No realtime voice is configured." }, { status: 400, headers: corsHeaders });
    if (!isSupportedOpenAIRealtimeVoice(voice)) {
      return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400, headers: corsHeaders });
    }
    if (!language) {
      return NextResponse.json({ error: "No enabled language is configured." }, { status: 400, headers: corsHeaders });
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: isDemo ? "Demo OpenAI API key is not configured. Set it in Platform Admin → Demo." : "Voice not configured on server" },
        { status: 503, headers: corsHeaders },
      );
    }

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
      console.error("[voice-connect] SDP exchange failed", {
        status: sdpResult.status,
        model,
        voice,
        demo: isDemo,
      });
      return NextResponse.json(
        { error: `SDP exchange failed (${sdpResult.status})`, details: sdpResult.errorText },
        { status: sdpResult.status >= 400 && sdpResult.status < 600 ? sdpResult.status : 502, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        sdpAnswer: String(sdpResult.data.sdpAnswer ?? ""),
        welcomeMessage: config.welcomeMessage ?? "",
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/voice-connect]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
