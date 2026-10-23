/**
 * src/modules/knowledge-bases/api/agent-config.ts
 * Route handlers for the AGENT-owned assistant config.
 * GET /api/agents/[agentId]/config  · PUT (full replace) · PATCH (partial update)
 *
 * Knowledge bases never carry assistant configuration — the agent owns it.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import { getAgentById } from "@/modules/organisations/core/db";
import { getAssistantConfigByAgent, putAssistantConfig, patchAssistantConfig } from "../core/db";
import type { PutAssistantConfigInput, PatchAssistantConfigInput } from "../core/models";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { preserveDisabledWidgetFieldsOnPatch, preserveDisabledWidgetFieldsOnPut } from "../core/widget-config-policy";

/**
 * Keep unexpected DB/provider errors in the operator logs only. This shared
 * configuration endpoint is called by both native agent settings and widget
 * design, so exposing the raw exception here would leak it to org members.
 */
function agentConfigErrorResponse(err: unknown, method: "GET" | "PUT" | "PATCH"): NextResponse {
  if (err instanceof NextResponse) return err;
  console.error(`[agent-config] ${method}:`, err);
  return NextResponse.json(
    { error: method === "GET" ? "Unable to load agent configuration." : "Unable to save agent configuration." },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function guardAgent(agentId: string): Promise<NextResponse|null> {
  const agent = await getAgentById(agentId);
  if (!agent) return NextResponse.json({error:"Agent not found"},{status:404});
  return null;
}

function validatePut(body: Record<string,unknown>): string|null {
  if (typeof body.assistantName!=="string"||!body.assistantName.trim()) return "assistantName is required";
  if (typeof body.systemPrompt!=="string"||!body.systemPrompt.trim())   return "systemPrompt is required";
  if (typeof body.welcomeMessage!=="string"||!body.welcomeMessage.trim()) return "welcomeMessage is required";
  if (typeof body.outOfScopeReply!=="string"||!body.outOfScopeReply.trim()) return "outOfScopeReply is required";
  if (!Array.isArray(body.rules)) return "rules must be an array";
  if (typeof body.defaultLanguage!=="string"||!body.defaultLanguage.trim()) return "defaultLanguage is required";
  if (!Array.isArray(body.allowedLanguages)||body.allowedLanguages.length===0) return "allowedLanguages must be non-empty";
  if (typeof body.voiceId!=="string"||!body.voiceId.trim()) return "voiceId is required";
  const speed=Number(body.speed); if (isNaN(speed)||speed<0.25||speed>4) return "speed must be 0.25–4.0";
  const temp=Number(body.temperature); if (isNaN(temp)||temp<0||temp>1) return "temperature must be 0–1";
  const mt=Number(body.maxTokens); if (isNaN(mt)||mt<50||mt>4000) return "maxTokens must be 50–4000";
  return null;
}

// ── Shared helper: safe string or null ───────────────────────────────────────
function s(v: unknown): string|null { return v!=null&&String(v).trim()?String(v).trim():null; }
function sn(v: unknown, fb: string): string { return v!=null&&String(v).trim()?String(v).trim():fb; }

// ── GET ───────────────────────────────────────────────────────────────────────
export async function getAgentConfigHandler(_req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(_req);
    await requireAgentPermission(auth, agentId, "project:read");
    const guard = await guardAgent(agentId); if (guard) return guard;
    const config = await getAssistantConfigByAgent(agentId);
    if (!config) return NextResponse.json({error:"AssistantConfig not found"},{status:404});
    return NextResponse.json(config);
  } catch (err) {
    return agentConfigErrorResponse(err, "GET");
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────
export async function putAgentConfigHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const guard = await guardAgent(agentId); if (guard) return guard;
    const body = (await req.json()) as Record<string,unknown>;
    const ve = validatePut(body); if (ve) return NextResponse.json({error:ve},{status:400});
    const primary = sn(body.primaryColour,"#6366f1");
    const input: PutAssistantConfigInput = {
      assistantName: sn(body.assistantName,"Clara"),
      avatarUrl: s(body.avatarUrl),
      systemPrompt: sn(body.systemPrompt,""),
      welcomeMessage: sn(body.welcomeMessage,"Hi! How can I help?"),
      outOfScopeReply: sn(body.outOfScopeReply,"I can only answer questions related to this topic."),
      rules: (body.rules as string[]).map(String),
      defaultLanguage: sn(body.defaultLanguage,"en"),
      allowedLanguages: (body.allowedLanguages as string[]).map(String),
      alwaysRespondIn: s(body.alwaysRespondIn),
      voiceId: sn(body.voiceId,"alloy"), speed: Number(body.speed),
      temperature: Number(body.temperature), maxTokens: Number(body.maxTokens),
      citeSources: Boolean(body.citeSources), strictMode: Boolean(body.strictMode),
      primaryColour: primary, accentColour: sn(body.accentColour,"#818cf8"),
      launcherColour: sn(body.launcherColour,primary),
      widgetTheme: body.widgetTheme==="dark"?"dark":"light",
      widgetPosition: body.widgetPosition==="bottom-left"?"bottom-left":"bottom-right",
      widgetButtonSize: Math.min(Math.max(Number(body.widgetButtonSize)||56,40),80),
      widgetBorderRadius: Math.min(Math.max(Number(body.widgetBorderRadius)??20,0),40),
      widgetFontFamily: sn(body.widgetFontFamily,"system-ui,sans-serif"),
      widgetChatHeight: Math.min(Math.max(Number(body.widgetChatHeight)||580,300),900),
      widgetShowBranding: body.widgetShowBranding!==false,
      widgetLauncherLabel: s(body.widgetLauncherLabel),
      widgetMode: ["inline","headless"].includes(String(body.widgetMode))?body.widgetMode as "inline"|"headless":"floating",
      // Extended (default to null if absent in PUT)
      headerBg:s(body.headerBg), headerTextColor:sn(body.headerTextColor,"#ffffff"),
      headerHeight:Number(body.headerHeight)||60, headerBlur:Boolean(body.headerBlur),
      showStatusDot:body.showStatusDot!==false, statusDotColor:sn(body.statusDotColor,"#4ade80"),
      avatarShape:(["circle","rounded","square"].includes(String(body.avatarShape))?body.avatarShape:"circle") as "circle"|"rounded"|"square",
      chatAreaBg:s(body.chatAreaBg),
      userBubbleBg:s(body.userBubbleBg), userBubbleText:sn(body.userBubbleText,"#ffffff"),
      userBubbleRadius:sn(body.userBubbleRadius,"18px 18px 4px 18px"),
      userBubblePadding:sn(body.userBubblePadding,"10px 14px"),
      userBubbleShadow:sn(body.userBubbleShadow,"0 1px 4px rgba(0,0,0,0.15)"),
      botBubbleBg:s(body.botBubbleBg), botBubbleText:s(body.botBubbleText),
      botBubbleRadius:sn(body.botBubbleRadius,"18px 18px 18px 4px"),
      botBubbleBorder:s(body.botBubbleBorder),
      botBubblePadding:sn(body.botBubblePadding,"10px 14px"),
      botBubbleShadow:sn(body.botBubbleShadow,"0 1px 3px rgba(0,0,0,0.08)"),
      messageGap:Number(body.messageGap)||12, messageMaxWidth:Number(body.messageMaxWidth)||85,
      messageFontSize:Number(body.messageFontSize)||13, messageLineHeight:Number(body.messageLineHeight)||1.5,
      showTimestamps:Boolean(body.showTimestamps), timestampColor:sn(body.timestampColor,"#9ca3af"),
      timestampFontSize:Number(body.timestampFontSize)||10,
      typingDotColor:sn(body.typingDotColor,"#9ca3af"), typingDotSize:Number(body.typingDotSize)||6,
      inputBg:s(body.inputBg), inputBorder:s(body.inputBorder),
      inputBorderFocus:s(body.inputBorderFocus), inputRadius:Number(body.inputRadius)||12,
      inputTextColor:s(body.inputTextColor), inputPlaceholderColor:s(body.inputPlaceholderColor),
      inputPadding:sn(body.inputPadding,"8px 12px"),
      inputAreaBg:s(body.inputAreaBg), inputAreaBorder:s(body.inputAreaBorder),
      sendBtnBg:s(body.sendBtnBg), sendBtnHoverBg:s(body.sendBtnHoverBg),
      sendBtnTextColor:sn(body.sendBtnTextColor,"#ffffff"),
      sendBtnRadius:Number(body.sendBtnRadius)||10, sendBtnSize:Number(body.sendBtnSize)||36,
      scrollbarWidth:Number(body.scrollbarWidth)||4,
      scrollbarColor:sn(body.scrollbarColor,"#c7d2fe"),
      scrollbarTrackColor:sn(body.scrollbarTrackColor,"transparent"),
      footerBg:s(body.footerBg), footerTextColor:s(body.footerTextColor),
      animationsEnabled:body.animationsEnabled!==false,
      messageAnimationStyle:(["fade","slide","pop","none"].includes(String(body.messageAnimationStyle))?body.messageAnimationStyle:"fade") as "fade"|"slide"|"pop"|"none",
      customCss:s(body.customCss), customLauncherSvg:s(body.customLauncherSvg),
      customHeaderHtml:s(body.customHeaderHtml), customFooterHtml:s(body.customFooterHtml),
      customThemeCss:s(body.customThemeCss), customInjectJs:s(body.customInjectJs),
      customPoweredBy:s(body.customPoweredBy),
      // Voice mode design
      voiceBtnBg:s(body.voiceBtnBg), voiceBtnSize:Number(body.voiceBtnSize)||36,
      voiceBtnRadius:Number(body.voiceBtnRadius)||10, voiceBtnActiveColor:sn(body.voiceBtnActiveColor,"#ef4444"),
      voicePanelBg:s(body.voicePanelBg), voiceWaveColor:sn(body.voiceWaveColor,"#6366f1"),
    };
    if (!isPlatformFeatureEnabled("embeddableWidget")) {
      const existing = await getAssistantConfigByAgent(agentId);
      if (!preserveDisabledWidgetFieldsOnPut(input, body, existing)) {
        return NextResponse.json(
          { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
          { status: 404 },
        );
      }
    }
    const config = await putAssistantConfig(agentId, input);
    return NextResponse.json(config);
  } catch (err) {
    return agentConfigErrorResponse(err, "PUT");
  }
}


// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function patchAgentConfigHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const guard = await guardAgent(agentId); if (guard) return guard;
    const body = (await req.json()) as Record<string,unknown>;
    const input: PatchAssistantConfigInput = {};

    // Core fields
    if (body.assistantName!==undefined)    input.assistantName   = String(body.assistantName).trim();
    if (body.avatarUrl!==undefined)        input.avatarUrl        = s(body.avatarUrl);
    if (body.systemPrompt!==undefined)     input.systemPrompt     = String(body.systemPrompt).trim();
    if (body.welcomeMessage!==undefined)   input.welcomeMessage   = String(body.welcomeMessage).trim();
    if (body.outOfScopeReply!==undefined)  input.outOfScopeReply  = String(body.outOfScopeReply).trim();
    if (body.rules!==undefined)            input.rules            = (body.rules as string[]).map(String);
    if (body.defaultLanguage!==undefined)  input.defaultLanguage  = String(body.defaultLanguage).trim();
    if (body.allowedLanguages!==undefined) input.allowedLanguages = (body.allowedLanguages as string[]).map(String);
    if (body.alwaysRespondIn!==undefined)  input.alwaysRespondIn  = s(body.alwaysRespondIn);
    if (body.voiceId!==undefined)          input.voiceId          = String(body.voiceId).trim();
    if (body.speed!==undefined)            input.speed            = Number(body.speed);
    if (body.temperature!==undefined)      input.temperature      = Number(body.temperature);
    if (body.maxTokens!==undefined)        input.maxTokens        = Number(body.maxTokens);
    if (body.citeSources!==undefined)      input.citeSources      = Boolean(body.citeSources);
    if (body.strictMode!==undefined)       input.strictMode       = Boolean(body.strictMode);
    if (body.primaryColour!==undefined)    input.primaryColour    = String(body.primaryColour).trim();
    if (body.accentColour!==undefined)     input.accentColour     = String(body.accentColour).trim();
    if (body.launcherColour!==undefined)   input.launcherColour   = String(body.launcherColour).trim();
    if (body.widgetTheme!==undefined)      input.widgetTheme      = body.widgetTheme==="dark"?"dark":"light";
    if (body.widgetPosition!==undefined)   input.widgetPosition   = body.widgetPosition==="bottom-left"?"bottom-left":"bottom-right";
    if (body.widgetButtonSize!==undefined)   input.widgetButtonSize   = Math.min(Math.max(Number(body.widgetButtonSize),40),80);
    if (body.widgetBorderRadius!==undefined) input.widgetBorderRadius = Math.min(Math.max(Number(body.widgetBorderRadius),0),40);
    if (body.widgetFontFamily!==undefined)   input.widgetFontFamily   = String(body.widgetFontFamily).trim();
    if (body.widgetChatHeight!==undefined)   input.widgetChatHeight   = Math.min(Math.max(Number(body.widgetChatHeight),300),900);
    if (body.widgetShowBranding!==undefined) input.widgetShowBranding = Boolean(body.widgetShowBranding);
    if (body.widgetLauncherLabel!==undefined) input.widgetLauncherLabel = s(body.widgetLauncherLabel);
    if (body.widgetMode!==undefined)         input.widgetMode = ["inline","headless"].includes(String(body.widgetMode))?body.widgetMode as "inline"|"headless":"floating";

    // ── Extended design fields ─────────────────────────────────────────────────
    if (body.headerBg!==undefined)          input.headerBg          = s(body.headerBg);
    if (body.headerTextColor!==undefined)   input.headerTextColor   = String(body.headerTextColor);
    if (body.headerHeight!==undefined)      input.headerHeight      = Number(body.headerHeight);
    if (body.headerBlur!==undefined)        input.headerBlur        = Boolean(body.headerBlur);
    if (body.showStatusDot!==undefined)     input.showStatusDot     = Boolean(body.showStatusDot);
    if (body.statusDotColor!==undefined)    input.statusDotColor    = String(body.statusDotColor);
    if (body.avatarShape!==undefined)       input.avatarShape       = (["circle","rounded","square"].includes(String(body.avatarShape))?body.avatarShape:"circle") as "circle"|"rounded"|"square";
    if (body.chatAreaBg!==undefined)        input.chatAreaBg        = s(body.chatAreaBg);
    if (body.userBubbleBg!==undefined)      input.userBubbleBg      = s(body.userBubbleBg);
    if (body.userBubbleText!==undefined)    input.userBubbleText    = String(body.userBubbleText);
    if (body.userBubbleRadius!==undefined)  input.userBubbleRadius  = String(body.userBubbleRadius);
    if (body.userBubblePadding!==undefined) input.userBubblePadding = String(body.userBubblePadding);
    if (body.userBubbleShadow!==undefined)  input.userBubbleShadow  = String(body.userBubbleShadow);
    if (body.botBubbleBg!==undefined)       input.botBubbleBg       = s(body.botBubbleBg);
    if (body.botBubbleText!==undefined)     input.botBubbleText     = s(body.botBubbleText);
    if (body.botBubbleRadius!==undefined)   input.botBubbleRadius   = String(body.botBubbleRadius);
    if (body.botBubbleBorder!==undefined)   input.botBubbleBorder   = s(body.botBubbleBorder);
    if (body.botBubblePadding!==undefined)  input.botBubblePadding  = String(body.botBubblePadding);
    if (body.botBubbleShadow!==undefined)   input.botBubbleShadow   = String(body.botBubbleShadow);
    if (body.messageGap!==undefined)        input.messageGap        = Number(body.messageGap);
    if (body.messageMaxWidth!==undefined)   input.messageMaxWidth   = Number(body.messageMaxWidth);
    if (body.messageFontSize!==undefined)   input.messageFontSize   = Number(body.messageFontSize);
    if (body.messageLineHeight!==undefined) input.messageLineHeight = Number(body.messageLineHeight);
    if (body.showTimestamps!==undefined)    input.showTimestamps    = Boolean(body.showTimestamps);
    if (body.timestampColor!==undefined)    input.timestampColor    = String(body.timestampColor);
    if (body.timestampFontSize!==undefined) input.timestampFontSize = Number(body.timestampFontSize);
    if (body.typingDotColor!==undefined)    input.typingDotColor    = String(body.typingDotColor);
    if (body.typingDotSize!==undefined)     input.typingDotSize     = Number(body.typingDotSize);
    if (body.inputBg!==undefined)           input.inputBg           = s(body.inputBg);
    if (body.inputBorder!==undefined)       input.inputBorder       = s(body.inputBorder);
    if (body.inputBorderFocus!==undefined)  input.inputBorderFocus  = s(body.inputBorderFocus);
    if (body.inputRadius!==undefined)       input.inputRadius       = Number(body.inputRadius);
    if (body.inputTextColor!==undefined)    input.inputTextColor    = s(body.inputTextColor);
    if (body.inputPlaceholderColor!==undefined) input.inputPlaceholderColor = s(body.inputPlaceholderColor);
    if (body.inputPadding!==undefined)      input.inputPadding      = String(body.inputPadding);
    if (body.inputAreaBg!==undefined)       input.inputAreaBg       = s(body.inputAreaBg);
    if (body.inputAreaBorder!==undefined)   input.inputAreaBorder   = s(body.inputAreaBorder);
    if (body.sendBtnBg!==undefined)         input.sendBtnBg         = s(body.sendBtnBg);
    if (body.sendBtnHoverBg!==undefined)    input.sendBtnHoverBg    = s(body.sendBtnHoverBg);
    if (body.sendBtnTextColor!==undefined)  input.sendBtnTextColor  = String(body.sendBtnTextColor);
    if (body.sendBtnRadius!==undefined)     input.sendBtnRadius     = Number(body.sendBtnRadius);
    if (body.sendBtnSize!==undefined)       input.sendBtnSize       = Number(body.sendBtnSize);
    if (body.scrollbarWidth!==undefined)    input.scrollbarWidth    = Number(body.scrollbarWidth);
    if (body.scrollbarColor!==undefined)    input.scrollbarColor    = String(body.scrollbarColor);
    if (body.scrollbarTrackColor!==undefined) input.scrollbarTrackColor = String(body.scrollbarTrackColor);
    if (body.footerBg!==undefined)          input.footerBg          = s(body.footerBg);
    if (body.footerTextColor!==undefined)   input.footerTextColor   = s(body.footerTextColor);
    if (body.animationsEnabled!==undefined) input.animationsEnabled = Boolean(body.animationsEnabled);
    if (body.messageAnimationStyle!==undefined) input.messageAnimationStyle = (["fade","slide","pop","none"].includes(String(body.messageAnimationStyle))?body.messageAnimationStyle:"fade") as "fade"|"slide"|"pop"|"none";
    if (body.customCss!==undefined)         input.customCss         = s(body.customCss);
    if (body.customLauncherSvg!==undefined) input.customLauncherSvg = s(body.customLauncherSvg);
    if (body.customHeaderHtml!==undefined)  input.customHeaderHtml  = s(body.customHeaderHtml);
    if (body.customFooterHtml!==undefined)  input.customFooterHtml  = s(body.customFooterHtml);
    if (body.customThemeCss!==undefined)    input.customThemeCss    = s(body.customThemeCss);
    if (body.customInjectJs!==undefined)    input.customInjectJs    = s(body.customInjectJs);
    if (body.customPoweredBy!==undefined)   input.customPoweredBy   = s(body.customPoweredBy);
    // Voice mode design
    if (body.voiceBtnBg!==undefined)           input.voiceBtnBg           = s(body.voiceBtnBg);
    if (body.voiceBtnSize!==undefined)         input.voiceBtnSize         = Number(body.voiceBtnSize);
    if (body.voiceBtnRadius!==undefined)       input.voiceBtnRadius       = Number(body.voiceBtnRadius);
    if (body.voiceBtnActiveColor!==undefined)  input.voiceBtnActiveColor  = s(body.voiceBtnActiveColor);
    if (body.voicePanelBg!==undefined)         input.voicePanelBg         = s(body.voicePanelBg);
    if (body.voiceWaveColor!==undefined)       input.voiceWaveColor       = s(body.voiceWaveColor);

    if (!isPlatformFeatureEnabled("embeddableWidget")) {
      // Only the widget-design subset of this shared API is disabled: native
      // chat/voice, persona and language updates continue to work unchanged.
      const existing = await getAssistantConfigByAgent(agentId);
      if (!preserveDisabledWidgetFieldsOnPatch(input, existing)) {
        return NextResponse.json(
          { error: "This feature is not available in this environment.", code: "FEATURE_DISABLED" },
          { status: 404 },
        );
      }
    }
    const config = await patchAssistantConfig(agentId, input);
    // Compatibility projection (migration Stage I): mirror the legacy write
    // into the Main-branch draft so the new versioned stores and the legacy
    // editor can never diverge during the rollout window.
    try {
      const { syncDraftFromLegacyPatch } = await import("@/modules/agent-versioning/core/projection");
      await syncDraftFromLegacyPatch(agentId);
    } catch (projectionErr) {
      console.warn("[agent-config] draft sync failed:", (projectionErr as Error).message);
    }
    if (!config) return NextResponse.json({error:"AssistantConfig not found"},{status:404});
    return NextResponse.json(config);
  } catch (err) {
    return agentConfigErrorResponse(err, "PATCH");
  }
}
