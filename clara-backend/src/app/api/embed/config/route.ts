/**
 * GET /api/embed/config
 * Returns the full public assistant configuration for a KB — validated by API key.
 * ALL design fields are included so the deployed widget renders exactly as customised.
 * Sensitive fields (system prompt, rules, model settings) are excluded.
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

    return NextResponse.json(
      {
        // ── Identity ──────────────────────────────────────────────────────────
        kbId:            kb.id,
        kbName:          kb.name,
        assistantName:   config.assistantName,
        avatarUrl:       config.avatarUrl,
        welcomeMessage:  config.welcomeMessage,
        defaultLanguage: config.defaultLanguage,

        // ── Voice ─────────────────────────────────────────────────────────────
        voiceEnabled:    resolved.flags.voiceEnabled && resolved.flags.realtimeEnabled,
        voiceProvider:   resolved.provider ?? "openai",

        // ── Core colours ──────────────────────────────────────────────────────
        primaryColour:   config.primaryColour,
        accentColour:    config.accentColour,
        launcherColour:  config.launcherColour,

        // ── Widget layout ─────────────────────────────────────────────────────
        widgetTheme:         config.widgetTheme,
        widgetPosition:      config.widgetPosition,
        widgetButtonSize:    config.widgetButtonSize,
        widgetBorderRadius:  config.widgetBorderRadius,
        widgetFontFamily:    config.widgetFontFamily,
        widgetChatHeight:    config.widgetChatHeight,
        widgetShowBranding:  config.widgetShowBranding,
        widgetLauncherLabel: config.widgetLauncherLabel,
        widgetMode:          config.widgetMode,

        // ── Header ────────────────────────────────────────────────────────────
        headerBg:         config.headerBg,
        headerTextColor:  config.headerTextColor,
        headerHeight:     config.headerHeight,
        headerBlur:       config.headerBlur,
        showStatusDot:    config.showStatusDot,
        statusDotColor:   config.statusDotColor,
        avatarShape:      config.avatarShape,

        // ── Chat area ─────────────────────────────────────────────────────────
        chatAreaBg:       config.chatAreaBg,

        // ── User bubble ───────────────────────────────────────────────────────
        userBubbleBg:      config.userBubbleBg,
        userBubbleText:    config.userBubbleText,
        userBubbleRadius:  config.userBubbleRadius,
        userBubblePadding: config.userBubblePadding,
        userBubbleShadow:  config.userBubbleShadow,

        // ── Bot bubble ────────────────────────────────────────────────────────
        botBubbleBg:      config.botBubbleBg,
        botBubbleText:    config.botBubbleText,
        botBubbleRadius:  config.botBubbleRadius,
        botBubbleBorder:  config.botBubbleBorder,
        botBubblePadding: config.botBubblePadding,
        botBubbleShadow:  config.botBubbleShadow,

        // ── Message list ──────────────────────────────────────────────────────
        messageGap:        config.messageGap,
        messageMaxWidth:   config.messageMaxWidth,
        messageFontSize:   config.messageFontSize,
        messageLineHeight: config.messageLineHeight,

        // ── Timestamps ────────────────────────────────────────────────────────
        showTimestamps:    config.showTimestamps,
        timestampColor:    config.timestampColor,
        timestampFontSize: config.timestampFontSize,

        // ── Typing indicator ──────────────────────────────────────────────────
        typingDotColor:    config.typingDotColor,
        typingDotSize:     config.typingDotSize,

        // ── Input area ────────────────────────────────────────────────────────
        inputBg:               config.inputBg,
        inputBorder:           config.inputBorder,
        inputBorderFocus:      config.inputBorderFocus,
        inputRadius:           config.inputRadius,
        inputTextColor:        config.inputTextColor,
        inputPlaceholderColor: config.inputPlaceholderColor,
        inputPadding:          config.inputPadding,
        inputAreaBg:           config.inputAreaBg,
        inputAreaBorder:       config.inputAreaBorder,

        // ── Send button ───────────────────────────────────────────────────────
        sendBtnBg:          config.sendBtnBg,
        sendBtnHoverBg:     config.sendBtnHoverBg,
        sendBtnTextColor:   config.sendBtnTextColor,
        sendBtnRadius:      config.sendBtnRadius,
        sendBtnSize:        config.sendBtnSize,

        // ── Scrollbar ─────────────────────────────────────────────────────────
        scrollbarWidth:      config.scrollbarWidth,
        scrollbarColor:      config.scrollbarColor,
        scrollbarTrackColor: config.scrollbarTrackColor,

        // ── Branding footer ───────────────────────────────────────────────────
        footerBg:            config.footerBg,
        footerTextColor:     config.footerTextColor,
        customPoweredBy:     config.customPoweredBy,

        // ── Animations ────────────────────────────────────────────────────────
        animationsEnabled:     config.animationsEnabled,
        messageAnimationStyle: config.messageAnimationStyle,

        // ── Advanced code overrides ───────────────────────────────────────────
        customCss:          config.customCss,
        customLauncherSvg:  config.customLauncherSvg,
        customHeaderHtml:   config.customHeaderHtml,
        customFooterHtml:   config.customFooterHtml,
        customThemeCss:     config.customThemeCss,
        customInjectJs:     config.customInjectJs,
        // ── Voice mode design ────────────────────────────────────────────────
        voiceBtnBg:          config.voiceBtnBg,
        voiceBtnSize:        config.voiceBtnSize,
        voiceBtnRadius:      config.voiceBtnRadius,
        voiceBtnActiveColor: config.voiceBtnActiveColor,
        voicePanelBg:        config.voicePanelBg,
        voiceWaveColor:      config.voiceWaveColor,
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[embed/config]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
