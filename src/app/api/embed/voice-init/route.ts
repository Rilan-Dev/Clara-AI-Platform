/**
 * POST /api/embed/voice-init
 * Internal server-side voice configuration endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, requireVoiceAccess, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { resolveAIConfig, AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { isSupportedOpenAIRealtimeVoice } from "@/modules/assistant/api/openai-catalog";

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

    const [kb, config] = await Promise.all([getKnowledgeBaseById(ctx.kbId), getAssistantConfig(ctx.kbId)]);
    if (!kb || !config) return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "realtime" });
    const voice = resolved.voiceId;
    if (!voice) {
      return NextResponse.json({ error: "No voice is assigned to this project." }, { status: 400, headers: corsHeaders });
    }
    if (resolved.provider === "openai" && !isSupportedOpenAIRealtimeVoice(voice)) {
      return NextResponse.json({ error: `Unsupported OpenAI Realtime voice: ${voice}` }, { status: 400, headers: corsHeaders });
    }

    const systemPrompt = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "realtime",
      allowedLanguages: resolved.allowedLanguages,
    });

    return NextResponse.json({
      kbId: ctx.kbId,
      projectId: resolved.projectId,
      provider: resolved.provider,
      model: resolved.realtimeModel,
      voice,
      temperature: resolved.temperature ?? config.temperature ?? 0.7,
      maxTokens: resolved.maxTokens ?? config.maxTokens ?? 1024,
      systemPrompt,
      kbName: kb.name,
      transcriptionModel: resolved.transcriptionModel,
      language: resolved.defaultLanguage,
      allowedLanguages: resolved.allowedLanguages,
    }, { headers: corsHeaders });
  } catch (err) {
    if (err instanceof AIConfigResolutionError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[embed/voice-init]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
