/**
 * GET /api/embed/config
 * Returns the public assistant configuration for a KB — validated by API key.
 * Sensitive fields (system prompt and provider credentials) are excluded.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { resolveAIConfig, AIConfigResolutionError } from "@/modules/ai-core/resolve";
import { resolveVoiceConfig, VoiceConfigResolutionError } from "@/modules/voice-core/resolve";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let corsHeaders: Record<string, string> = {};
  try {
    await ensureMigrated();

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    corsHeaders = buildCorsHeaders(req.headers.get("origin"), ctx.allowedOrigins, req.nextUrl.origin);

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfigByKb(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    if (!resolved.flags.publicEmbedEnabled) {
      return NextResponse.json(
        { error: "Public embed is disabled for this knowledge base" },
        { status: 403, headers: corsHeaders },
      );
    }

    // Voice-axis resolution — the field used to report the BRAIN provider,
    // which mis-branded ElevenLabs-configured orgs as "openai" on every
    // embed host. Falls back to the brain provider on resolution failure so
    // a voice misconfiguration never takes the whole embed config down.
    let voiceProvider: string = resolved.provider ?? "openai";
    try {
      const voice = await resolveVoiceConfig({ kbId: ctx.kbId, surface: "embed" });
      voiceProvider = voice.realtimeProvider;
    } catch (voiceError) {
      if (!(voiceError instanceof VoiceConfigResolutionError)) throw voiceError;
    }

    return NextResponse.json(
      {
        kbId: kb.id,
        kbName: kb.name,
        assistantName: effectiveConfig.assistantName,
        avatarUrl: effectiveConfig.avatarUrl,
        welcomeMessage: effectiveConfig.welcomeMessage,
        defaultLanguage: config.defaultLanguage,

        voiceEnabled: resolved.flags.voiceEnabled && resolved.flags.realtimeEnabled,
        voiceProvider,

        // Non-secret effective AI runtime configuration. This makes tenant
        // resolution observable from the iframe without exposing API keys.
        runtime: {
          provider: resolved.provider,
          chatModel: resolved.chatModel,
          embeddingModel: resolved.embeddingModel,
          realtimeModel: resolved.realtimeModel,
          transcriptionModel: resolved.transcriptionModel,
          voiceId: resolved.voiceId,
          allowedLanguages: resolved.allowedLanguages,
          defaultLanguage: resolved.defaultLanguage,
          sources: resolved.sources,
          flags: resolved.flags,
        },

        primaryColour: effectiveConfig.primaryColour,
        accentColour: effectiveConfig.accentColour,
        launcherColour: config.launcherColour,
        widgetTheme: config.widgetTheme,
        widgetPosition: config.widgetPosition,
        widgetButtonSize: config.widgetButtonSize,
        widgetBorderRadius: config.widgetBorderRadius,
        widgetFontFamily: config.widgetFontFamily,
        widgetChatHeight: config.widgetChatHeight,
        widgetShowBranding: config.widgetShowBranding,
        widgetLauncherLabel: config.widgetLauncherLabel,
        widgetMode: config.widgetMode,
        headerBg: config.headerBg,
        headerTextColor: config.headerTextColor,
        headerHeight: config.headerHeight,
        headerBlur: config.headerBlur,
        showStatusDot: config.showStatusDot,
        statusDotColor: config.statusDotColor,
        avatarShape: config.avatarShape,
        chatAreaBg: config.chatAreaBg,
        userBubbleBg: config.userBubbleBg,
        userBubbleText: config.userBubbleText,
        userBubbleRadius: config.userBubbleRadius,
        userBubblePadding: config.userBubblePadding,
        userBubbleShadow: config.userBubbleShadow,
        botBubbleBg: config.botBubbleBg,
        botBubbleText: config.botBubbleText,
        botBubbleRadius: config.botBubbleRadius,
        botBubbleBorder: config.botBubbleBorder,
        botBubblePadding: config.botBubblePadding,
        botBubbleShadow: config.botBubbleShadow,
        messageGap: config.messageGap,
        messageMaxWidth: config.messageMaxWidth,
        messageFontSize: config.messageFontSize,
        messageLineHeight: config.messageLineHeight,
        showTimestamps: config.showTimestamps,
        timestampColor: config.timestampColor,
        timestampFontSize: config.timestampFontSize,
        typingDotColor: config.typingDotColor,
        typingDotSize: config.typingDotSize,
        inputBg: config.inputBg,
        inputBorder: config.inputBorder,
        inputBorderFocus: config.inputBorderFocus,
        inputRadius: config.inputRadius,
        inputTextColor: config.inputTextColor,
        inputPlaceholderColor: config.inputPlaceholderColor,
        inputPadding: config.inputPadding,
        inputAreaBg: config.inputAreaBg,
        inputAreaBorder: config.inputAreaBorder,
        sendBtnBg: config.sendBtnBg,
        sendBtnHoverBg: config.sendBtnHoverBg,
        sendBtnTextColor: config.sendBtnTextColor,
        sendBtnRadius: config.sendBtnRadius,
        sendBtnSize: config.sendBtnSize,
        scrollbarWidth: config.scrollbarWidth,
        scrollbarColor: config.scrollbarColor,
        scrollbarTrackColor: config.scrollbarTrackColor,
        footerBg: config.footerBg,
        footerTextColor: config.footerTextColor,
        customPoweredBy: config.customPoweredBy,
        animationsEnabled: config.animationsEnabled,
        messageAnimationStyle: config.messageAnimationStyle,
        customCss: config.customCss,
        customLauncherSvg: config.customLauncherSvg,
        customHeaderHtml: config.customHeaderHtml,
        customFooterHtml: config.customFooterHtml,
        customThemeCss: config.customThemeCss,
        customInjectJs: config.customInjectJs,
        voiceBtnBg: config.voiceBtnBg,
        voiceBtnSize: config.voiceBtnSize,
        voiceBtnRadius: config.voiceBtnRadius,
        voiceBtnActiveColor: config.voiceBtnActiveColor,
        voicePanelBg: config.voicePanelBg,
        voiceWaveColor: config.voiceWaveColor,
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
    console.error("[embed/config]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500, headers: corsHeaders },
    );
  }
}