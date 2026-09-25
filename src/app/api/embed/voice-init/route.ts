/**
 * POST /api/embed/voice-init
 * Internal server-side voice configuration endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, requireVoiceAccess, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { AIConfigResolutionError, resolveAIConfig } from "@/modules/ai-core/resolve";
// import { getDemoAIConfig } from "@/modules/ai-core/demo-config";
import { isSupportedOpenAIRealtimeVoice } from "@/modules/assistant/api/openai-catalog";

// function isDemoRequest(req: NextRequest): boolean {
//   return (req.headers.get("authorization") ?? "").trim() === "Bearer DEMO_MODE";
// }

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
      getAssistantConfigByKb(ctx.kbId),
    ]);
    if (!kb || !config) return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });

    // const isDemo = isDemoRequest(req);
    // const demoConfig = isDemo ? await getDemoAIConfig() : null;
    // if (isDemo && !demoConfig) {
    //   return NextResponse.json(
    //     { error: "Demo AI provider is not configured. Configure the provider and API key in Platform Admin → Demo." },
    //     { status: 503, headers: corsHeaders },
    //   );
    // }

    const resolved = 
    // isDemo ? null : 
    await resolveAIConfig({ kbId: ctx.kbId, surface: "realtime" });
    const provider = 
    // isDemo ? demoConfig!.provider : 
    resolved!.provider;
    const voice = 
    // isDemo ? demoConfig!.voiceId : 
    resolved!.voiceId;
    const model = 
    // isDemo ? demoConfig!.realtimeModel : 
    resolved!.realtimeModel;
    const allowedLanguages = 
    // isDemo ? (config.allowedLanguages ?? [config.defaultLanguage ?? "en"]) : 
    resolved!.allowedLanguages;
    const language = 
    // isDemo ? config.alwaysRespondIn ?? config.defaultLanguage ?? allowedLanguages[0] ?? "en" : 
    resolved!.defaultLanguage;

    if (!voice) return NextResponse.json({ error: "No voice is assigned to this project." }, { status: 400, headers: corsHeaders });
    if (provider === "openai" && !isSupportedOpenAIRealtimeVoice(voice)) {
      return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400, headers: corsHeaders });
    }
    if (!model) return NextResponse.json({ error: "No realtime model is configured." }, { status: 400, headers: corsHeaders });

    const systemPrompt = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "realtime",
      allowedLanguages,
    });

    return NextResponse.json({
      kbId: ctx.kbId,
      projectId: resolved?.agentId ?? null,
      provider,
      model,
      voice,
      temperature: 
      // isDemo ? config.temperature ?? 0.7 : 
      resolved!.temperature ?? config.temperature ?? 0.7,
      maxTokens: 
      // isDemo ? config.maxTokens ?? 1024 : 
      // Realtime output cap (spoken audio counts too) — org / platform
      // "Max realtime tokens"; unset → provider default "inf".
      resolved!.realtimeMaxOutputTokens ?? "inf",
      systemPrompt,
      kbName: kb.name,
      transcriptionModel: 
      // isDemo ? demoConfig!.transcriptionModel : 
      resolved!.transcriptionModel,
      language,
      allowedLanguages,
    }, { headers: corsHeaders });
  } catch (err) {
    if (err instanceof AIConfigResolutionError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[embed/voice-init]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
