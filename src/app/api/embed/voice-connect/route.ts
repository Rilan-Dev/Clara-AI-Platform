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
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import { buildOpenAIRealtimeSession, exchangeOpenAIRealtimeSdp } from "@/modules/assistant/api/openai-realtime";
import { isSupportedOpenAIRealtimeVoice } from "@/modules/assistant/api/openai-catalog";

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
    const isDemo = (req.headers.get("authorization") ?? "").trim() === "Bearer DEMO_MODE";

    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const body = (await req.json()) as { sdpOffer?: string };
    if (!body.sdpOffer?.trim()) {
      return NextResponse.json({ error: "sdpOffer is required" }, { status: 400, headers: corsHeaders });
    }

    const [kb, config] = await Promise.all([getKnowledgeBaseById(ctx.kbId), getAssistantConfig(ctx.kbId)]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    // Always resolve from the tenant/project configuration. Demo mode only
    // changes how the server obtains its API key; it must never bypass the
    // project's assigned model, voice, or language boundary.
    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "realtime" });
    if (resolved.provider !== "openai") {
      return NextResponse.json({ error: "Public realtime voice currently requires an OpenAI project configuration." }, { status: 503, headers: corsHeaders });
    }

    const model = resolved.realtimeModel;
    const voice = resolved.voiceId;
    if (!model) return NextResponse.json({ error: "No realtime model is assigned to this project." }, { status: 400, headers: corsHeaders });
    if (!voice) return NextResponse.json({ error: "No voice is assigned to this project." }, { status: 400, headers: corsHeaders });
    if (!isSupportedOpenAIRealtimeVoice(voice)) {
      return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400, headers: corsHeaders });
    }
    if (!resolved.allowedLanguages.length || !resolved.defaultLanguage) {
      return NextResponse.json({ error: "No enabled language is assigned to this project." }, { status: 400, headers: corsHeaders });
    }

    const instructions = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "realtime",
      allowedLanguages: resolved.allowedLanguages,
    });
    const maxTokens = resolved.maxTokens ?? config.maxTokens ?? 1024;
    const transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    const language = resolved.defaultLanguage;
    let welcomeMsg = config.welcomeMessage?.trim() ?? "";
    let apiKey: string | undefined;

    if (isDemo) {
      const settings = await getPlatformEnvSettings();
      const demoProvider = setting(settings, "DEMO_AI_PROVIDER").toLowerCase() || process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() || "openai";
      if (demoProvider !== "openai") {
        return NextResponse.json(
          { error: "Public Demo voice currently requires the Demo AI provider to be OpenAI. Switch Platform Admin → Demo to OpenAI." },
          { status: 503, headers: corsHeaders },
        );
      }
      apiKey = setting(settings, "DEMO_OPENAI_API_KEY") || process.env.DEMO_OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json(
          { error: "Demo OpenAI API key is not configured. Set it in Platform Admin → Demo." },
          { status: 503, headers: corsHeaders },
        );
      }
      // Demo welcome text remains configurable, but model/voice/language are
      // deliberately NOT overridden by global demo settings.
      welcomeMsg = setting(settings, "DEMO_WELCOME_MESSAGE") || welcomeMsg;
    } else {
      apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) return NextResponse.json({ error: "Voice not configured on server" }, { status: 500, headers: corsHeaders });
    }

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
      transcription: { model: transcriptionModel, language },
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

    const sdpResult = await exchangeOpenAIRealtimeSdp({ apiKey, sdpOffer: body.sdpOffer, session: realtimeSession });
    if (!sdpResult.ok) {
      console.error("[voice-connect] SDP exchange failed:", sdpResult.errorText);
      return NextResponse.json({ error: `SDP exchange failed (${sdpResult.status})` }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ sdpAnswer: String(sdpResult.data.sdpAnswer ?? ""), welcomeMessage: welcomeMsg }, { headers: corsHeaders });
  } catch (err) {
    if (err instanceof AIConfigResolutionError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[embed/voice-connect]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
