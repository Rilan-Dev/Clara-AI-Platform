/**
 * POST /api/embed/voice-init
 * ─────────────────────────────────────────────────────────────────────────────
 * INTERNAL — called only by the server-side voice relay (scripts/voice-relay.mjs).
 * Never called from the browser directly.
 *
 * Validates the embed API key through the full pipeline (rate limit, voice gate,
 * origin check) and returns the KB voice configuration the relay needs to open
 * an upstream OpenAI / Gemini connection.
 *
 * Secrets (API keys, model names, system prompts) are returned here and used
 * exclusively server-side. They never appear in any browser-visible response.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated }            from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  requireVoiceAccess,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { buildSystemPrompt }         from "@/modules/knowledge-bases/core/config-builder";
import { resolveAIConfig, AIConfigResolutionError } from "@/modules/ai-core/resolve";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin      = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins);

    // Voice access gate — same as /api/embed/session
    const voiceDenied = requireVoiceAccess(ctx, corsHeaders);
    if (voiceDenied) return voiceDenied;

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json(
        { error: "KB configuration not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const resolved     = await resolveAIConfig({ kbId: ctx.kbId, surface: "embed" });
    const systemPrompt = buildSystemPrompt(config, { kbName: kb.name });

    // Return everything the relay needs — this response stays on the server
    return NextResponse.json({
      kbId:        ctx.kbId,
      provider:    resolved.provider ?? "openai",
      model:       resolved.realtimeModel ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview",
      geminiModel: resolved.realtimeModel ?? process.env.GEMINI_LIVE_MODEL    ?? "gemini-2.5-flash-native-audio-preview-12-2025",
      voice:       resolved.voiceId ?? config.voiceId ?? "alloy",
      geminiVoice: process.env.GEMINI_LIVE_VOICE ?? "Aoede",
      temperature: resolved.temperature ?? config.temperature ?? 0.7,
      maxTokens:   resolved.maxTokens   ?? config.maxTokens   ?? 1024,
      systemPrompt,
      kbName:      kb.name,
      transcriptionModel: resolved.transcriptionModel ?? "gpt-4o-mini-transcribe",
      language:    config.alwaysRespondIn ?? config.defaultLanguage ?? "en",
    }, { headers: corsHeaders });

  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[embed/voice-init]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
