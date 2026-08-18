/**
 * POST /api/embed/voice-connect
 * Secure WebRTC SDP proxy for the public Demo voice experience.
 * The browser never receives an OpenAI API key.
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
  exchangeOpenAIRealtimeSdp,
} from "@/modules/assistant/api/openai-realtime";

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

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    const instructions = buildSystemPrompt(config, { kbName: kb.name, surface: "voice" });

    let model = resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-mini";
    let voice = resolved.voiceId ?? config.voiceId ?? "alloy";
    let maxTokens = resolved.maxTokens ?? config.maxTokens ?? 1024;
    let transcriptionModel = resolved.transcriptionModel ?? "gpt-4o-mini-transcribe";
    let language = config.alwaysRespondIn ?? config.defaultLanguage ?? "en";
    let welcomeMsg = config.welcomeMessage?.trim() ?? "";
    let apiKey: string | undefined;

    if (isDemo) {
      const settings = await getPlatformEnvSettings();
      const demoProvider = setting(settings, "DEMO_AI_PROVIDER").toLowerCase() ||
        process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() || "openai";

      // The current public widget voice transport is OpenAI WebRTC. Keep the
      // provider switch visible in Admin, but fail explicitly instead of
      // silently using a Gemini/org credential when Demo is configured otherwise.
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

      model = setting(settings, "DEMO_OPENAI_REALTIME_MODEL") || process.env.DEMO_OPENAI_REALTIME_MODEL?.trim() || model;
      voice = setting(settings, "DEMO_OPENAI_VOICE") || process.env.DEMO_OPENAI_VOICE?.trim() || voice;
      transcriptionModel = setting(settings, "DEMO_OPENAI_TRANSCRIPTION_MODEL") ||
        process.env.DEMO_OPENAI_TRANSCRIPTION_MODEL?.trim() || transcriptionModel;
      welcomeMsg = setting(settings, "DEMO_WELCOME_MESSAGE") || welcomeMsg;
      maxTokens = Math.min(maxTokens, 1000);
    } else {
      apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json({ error: "Voice not configured on server" }, { status: 500, headers: corsHeaders });
      }
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
      transcription: {
        model: transcriptionModel,
        language,
      },
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
      const errText = sdpResult.errorText;
      console.error("[voice-connect] SDP exchange failed:", errText);
      return NextResponse.json(
        { error: `SDP exchange failed (${sdpResult.status})` },
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      { sdpAnswer: String(sdpResult.data.sdpAnswer ?? ""), welcomeMessage: welcomeMsg },
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
