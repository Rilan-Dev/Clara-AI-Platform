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

    const [resolved, voiceResult] = await Promise.all([
      resolveAIConfig({ kbId: ctx.kbId, surface: "chat" }),
      resolveVoiceConfig({ kbId: ctx.kbId, surface: "embed" }).catch((error) => {
        if (error instanceof VoiceConfigResolutionError) return null;
        throw error;
      }),
    ]);
    const effectiveConfig = resolved.assistantConfig ?? config;
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
    const voiceProvider: string = voiceResult?.realtimeProvider ?? resolved.provider ?? "openai";

    return NextResponse.json(
      {
        kbId: kb.id,
        kbName: kb.name,
        assistantName: effectiveConfig.assistantName,
        avatarUrl: effectiveConfig.avatarUrl,
        welcomeMessage: effectiveConfig.welcomeMessage,
        defaultLanguage: effectiveConfig.defaultLanguage,

        voiceEnabled: resolved.flags.voiceEnabled && resolved.flags.realtimeEnabled,
        voiceProvider,

        // Keep the public contract minimal. Runtime implementation details
        // (provider/model/source/flags) belong to server-side session resolution.
        allowedLanguages: resolved.allowedLanguages,
        voiceId: resolved.voiceId,


        primaryColour: effectiveConfig.primaryColour,
        accentColour: effectiveConfig.accentColour,
        launcherColour: effectiveConfig.launcherColour,
        widgetTheme: effectiveConfig.widgetTheme,
        widgetPosition: effectiveConfig.widgetPosition,
        widgetButtonSize: effectiveConfig.widgetButtonSize,
        widgetBorderRadius: effectiveConfig.widgetBorderRadius,
        widgetFontFamily: effectiveConfig.widgetFontFamily,
        widgetChatHeight: effectiveConfig.widgetChatHeight,
        widgetShowBranding: effectiveConfig.widgetShowBranding,
        widgetLauncherLabel: effectiveConfig.widgetLauncherLabel,
        widgetMode: effectiveConfig.widgetMode,
        headerBg: effectiveConfig.headerBg,
        headerTextColor: effectiveConfig.headerTextColor,
        headerHeight: effectiveConfig.headerHeight,
        headerBlur: effectiveConfig.headerBlur,
        showStatusDot: effectiveConfig.showStatusDot,
        statusDotColor: effectiveConfig.statusDotColor,
        avatarShape: effectiveConfig.avatarShape,
        chatAreaBg: effectiveConfig.chatAreaBg,
        userBubbleBg: effectiveConfig.userBubbleBg,
        userBubbleText: effectiveConfig.userBubbleText,
        userBubbleRadius: effectiveConfig.userBubbleRadius,
        userBubblePadding: effectiveConfig.userBubblePadding,
        userBubbleShadow: effectiveConfig.userBubbleShadow,
        botBubbleBg: effectiveConfig.botBubbleBg,
        botBubbleText: effectiveConfig.botBubbleText,
        botBubbleRadius: effectiveConfig.botBubbleRadius,
        botBubbleBorder: effectiveConfig.botBubbleBorder,
        botBubblePadding: effectiveConfig.botBubblePadding,
        botBubbleShadow: effectiveConfig.botBubbleShadow,
        messageGap: effectiveConfig.messageGap,
        messageMaxWidth: effectiveConfig.messageMaxWidth,
        messageFontSize: effectiveConfig.messageFontSize,
        messageLineHeight: effectiveConfig.messageLineHeight,
        showTimestamps: effectiveConfig.showTimestamps,
        timestampColor: effectiveConfig.timestampColor,
        timestampFontSize: effectiveConfig.timestampFontSize,
        typingDotColor: effectiveConfig.typingDotColor,
        typingDotSize: effectiveConfig.typingDotSize,
        inputBg: effectiveConfig.inputBg,
        inputBorder: effectiveConfig.inputBorder,
        inputBorderFocus: effectiveConfig.inputBorderFocus,
        inputRadius: effectiveConfig.inputRadius,
        inputTextColor: effectiveConfig.inputTextColor,
        inputPlaceholderColor: effectiveConfig.inputPlaceholderColor,
        inputPadding: effectiveConfig.inputPadding,
        inputAreaBg: effectiveConfig.inputAreaBg,
        inputAreaBorder: effectiveConfig.inputAreaBorder,
        sendBtnBg: effectiveConfig.sendBtnBg,
        sendBtnHoverBg: effectiveConfig.sendBtnHoverBg,
        sendBtnTextColor: effectiveConfig.sendBtnTextColor,
        sendBtnRadius: effectiveConfig.sendBtnRadius,
        sendBtnSize: effectiveConfig.sendBtnSize,
        scrollbarWidth: effectiveConfig.scrollbarWidth,
        scrollbarColor: effectiveConfig.scrollbarColor,
        scrollbarTrackColor: effectiveConfig.scrollbarTrackColor,
        footerBg: effectiveConfig.footerBg,
        footerTextColor: effectiveConfig.footerTextColor,
        customPoweredBy: effectiveConfig.customPoweredBy,
        animationsEnabled: effectiveConfig.animationsEnabled,
        messageAnimationStyle: effectiveConfig.messageAnimationStyle,
        customCss: effectiveConfig.customCss,
        customLauncherSvg: effectiveConfig.customLauncherSvg,
        customHeaderHtml: effectiveConfig.customHeaderHtml,
        customFooterHtml: effectiveConfig.customFooterHtml,
        customThemeCss: effectiveConfig.customThemeCss,
        customInjectJs: effectiveConfig.customInjectJs,
        voiceBtnBg: effectiveConfig.voiceBtnBg,
        voiceBtnSize: effectiveConfig.voiceBtnSize,
        voiceBtnRadius: effectiveConfig.voiceBtnRadius,
        voiceBtnActiveColor: effectiveConfig.voiceBtnActiveColor,
        voicePanelBg: effectiveConfig.voicePanelBg,
        voiceWaveColor: effectiveConfig.voiceWaveColor,
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof AIConfigResolutionError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
    console.error("[embed/config]:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500, headers: corsHeaders },
    );
  }
}
