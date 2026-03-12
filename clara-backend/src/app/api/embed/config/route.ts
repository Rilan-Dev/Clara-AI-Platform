/**
 * GET /api/embed/config
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the public assistant configuration for a KB — validated by API key.
 * Only non-sensitive display fields are returned (name, colours, welcome msg).
 * The system prompt, rules, and model settings stay server-side.
 *
 * Used by the embed widget on first load to render the correct branding.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { resolveAIConfig } from "@/modules/ai-core/resolve";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins);

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    if (!resolved.flags.publicEmbedEnabled) {
      return NextResponse.json(
        { error: "Public embed is disabled for this knowledge base" },
        { status: 403, headers: corsHeaders },
      );
    }

    if (!kb || !config) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404, headers: corsHeaders });
    }

    // Only return safe public-facing fields
    return NextResponse.json(
      {
        kbId:           kb.id,
        kbName:         kb.name,
        assistantName:  config.assistantName,
        avatarUrl:      config.avatarUrl,
        welcomeMessage: config.welcomeMessage,
        primaryColour:  config.primaryColour,
        accentColour:   config.accentColour,
        defaultLanguage: config.defaultLanguage,
        voiceEnabled:   resolved.flags.voiceEnabled && resolved.flags.realtimeEnabled,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[embed/config]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
