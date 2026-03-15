/**
 * src/modules/knowledge-bases/api/config.ts
 * Route handlers for assistant config.
 *
 * GET    /api/kbs/[kbId]/config   → getConfigHandler
 * PUT    /api/kbs/[kbId]/config   → putConfigHandler   (full replace)
 * PATCH  /api/kbs/[kbId]/config   → patchConfigHandler (partial update)
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getKnowledgeBaseById } from "../core/db";
import {
  getAssistantConfig,
  putAssistantConfig,
  patchAssistantConfig,
} from "../core/db";
import type { PutAssistantConfigInput, PatchAssistantConfigInput } from "../core/models";

// ── Guard ─────────────────────────────────────────────────────────────────────

async function guardKb(kbId: string): Promise<NextResponse | null> {
  const kb = await getKnowledgeBaseById(kbId);
  if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  return null;
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validatePut(body: Record<string, unknown>): string | null {
  if (typeof body.assistantName !== "string" || !body.assistantName.trim())
    return "assistantName is required";
  if (typeof body.systemPrompt !== "string" || !body.systemPrompt.trim())
    return "systemPrompt is required";
  if (typeof body.welcomeMessage !== "string" || !body.welcomeMessage.trim())
    return "welcomeMessage is required";
  if (typeof body.outOfScopeReply !== "string" || !body.outOfScopeReply.trim())
    return "outOfScopeReply is required";
  if (!Array.isArray(body.rules))
    return "rules must be an array";
  if (typeof body.defaultLanguage !== "string" || !body.defaultLanguage.trim())
    return "defaultLanguage is required";
  if (!Array.isArray(body.allowedLanguages) || body.allowedLanguages.length === 0)
    return "allowedLanguages must be a non-empty array";
  if (typeof body.voiceId !== "string" || !body.voiceId.trim())
    return "voiceId is required";
  const speed = Number(body.speed);
  if (isNaN(speed) || speed < 0.25 || speed > 4.0)
    return "speed must be between 0.25 and 4.0";
  const temp = Number(body.temperature);
  if (isNaN(temp) || temp < 0 || temp > 1)
    return "temperature must be between 0.0 and 1.0";
  const maxTokens = Number(body.maxTokens);
  if (isNaN(maxTokens) || maxTokens < 50 || maxTokens > 4000)
    return "maxTokens must be between 50 and 4000";
  return null;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /api/kbs/[kbId]/config
export async function getConfigHandler(
  _req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const guard = await guardKb(kbId);
    if (guard) return guard;

    const config = await getAssistantConfig(kbId);
    if (!config) {
      return NextResponse.json(
        { error: "AssistantConfig not found — re-create the knowledge base" },
        { status: 404 }
      );
    }
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PUT /api/kbs/[kbId]/config  — full replace
export async function putConfigHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const guard = await guardKb(kbId);
    if (guard) return guard;

    const body = (await req.json()) as Record<string, unknown>;
    const validationError = validatePut(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const input: PutAssistantConfigInput = {
      assistantName:   String(body.assistantName).trim(),
      avatarUrl:       body.avatarUrl ? String(body.avatarUrl).trim() : null,
      systemPrompt:    String(body.systemPrompt).trim(),
      welcomeMessage:  String(body.welcomeMessage).trim(),
      outOfScopeReply: String(body.outOfScopeReply).trim(),
      rules:           (body.rules as string[]).map(String),
      defaultLanguage: String(body.defaultLanguage).trim(),
      allowedLanguages:(body.allowedLanguages as string[]).map(String),
      alwaysRespondIn: body.alwaysRespondIn ? String(body.alwaysRespondIn).trim() : null,
      voiceId:         String(body.voiceId).trim(),
      speed:           Number(body.speed),
      temperature:     Number(body.temperature),
      maxTokens:       Number(body.maxTokens),
      citeSources:     Boolean(body.citeSources),
      strictMode:      Boolean(body.strictMode),
      primaryColour:   body.primaryColour ? String(body.primaryColour).trim() : "#6366f1",
      accentColour:    body.accentColour  ? String(body.accentColour).trim()  : "#a5b4fc",
      widgetTheme:        (body.widgetTheme === "dark" ? "dark" : "light"),
      widgetPosition:     (body.widgetPosition === "bottom-left" ? "bottom-left" : "bottom-right"),
      widgetButtonSize:   body.widgetButtonSize   ? Math.min(Math.max(Number(body.widgetButtonSize), 40), 80) : 56,
      widgetBorderRadius: body.widgetBorderRadius !== undefined ? Math.min(Math.max(Number(body.widgetBorderRadius), 0), 40) : 20,
      widgetFontFamily:   body.widgetFontFamily   ? String(body.widgetFontFamily).trim() : "system-ui,sans-serif",
      widgetChatHeight:   body.widgetChatHeight   ? Math.min(Math.max(Number(body.widgetChatHeight), 300), 900) : 580,
      widgetShowBranding: body.widgetShowBranding !== undefined ? Boolean(body.widgetShowBranding) : true,
      widgetLauncherLabel: body.widgetLauncherLabel ? String(body.widgetLauncherLabel).trim() : null,
      // Full design control fields (migration 019)
      widgetMode:        (body.widgetMode === "inline" || body.widgetMode === "headless"
                            ? body.widgetMode : "floating") as "floating" | "inline" | "headless",
      customCss:         body.customCss         ? String(body.customCss).trim()         : null,
      customLauncherSvg: body.customLauncherSvg ? String(body.customLauncherSvg).trim() : null,
      customHeaderHtml:  body.customHeaderHtml  ? String(body.customHeaderHtml).trim()  : null,
      customPoweredBy:   body.customPoweredBy   ? String(body.customPoweredBy).trim()   : null,
    };

    const config = await putAssistantConfig(kbId, input);
    return NextResponse.json(config);
  } catch (err) {
    console.error("[config] putConfig:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/kbs/[kbId]/config  — partial update
export async function patchConfigHandler(
  req: NextRequest,
  kbId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const guard = await guardKb(kbId);
    if (guard) return guard;

    const body = (await req.json()) as Record<string, unknown>;

    // Build partial input — only include defined fields
    const input: PatchAssistantConfigInput = {};

    if (body.assistantName   !== undefined) input.assistantName   = String(body.assistantName).trim();
    if (body.avatarUrl        !== undefined) input.avatarUrl        = body.avatarUrl ? String(body.avatarUrl).trim() : null;
    if (body.systemPrompt     !== undefined) input.systemPrompt     = String(body.systemPrompt).trim();
    if (body.welcomeMessage   !== undefined) input.welcomeMessage   = String(body.welcomeMessage).trim();
    if (body.outOfScopeReply  !== undefined) input.outOfScopeReply  = String(body.outOfScopeReply).trim();
    if (body.rules            !== undefined) input.rules            = (body.rules as string[]).map(String);
    if (body.defaultLanguage  !== undefined) input.defaultLanguage  = String(body.defaultLanguage).trim();
    if (body.allowedLanguages !== undefined) input.allowedLanguages = (body.allowedLanguages as string[]).map(String);
    if (body.alwaysRespondIn  !== undefined) input.alwaysRespondIn  = body.alwaysRespondIn ? String(body.alwaysRespondIn).trim() : null;
    if (body.voiceId          !== undefined) input.voiceId          = String(body.voiceId).trim();
    if (body.speed            !== undefined) input.speed            = Number(body.speed);
    if (body.temperature      !== undefined) input.temperature      = Number(body.temperature);
    if (body.maxTokens        !== undefined) input.maxTokens        = Number(body.maxTokens);
    if (body.citeSources      !== undefined) input.citeSources      = Boolean(body.citeSources);
    if (body.strictMode       !== undefined) input.strictMode       = Boolean(body.strictMode);
    if (body.primaryColour    !== undefined) input.primaryColour    = String(body.primaryColour).trim();
    if (body.accentColour     !== undefined) input.accentColour     = String(body.accentColour).trim();
    if (body.widgetTheme      !== undefined) input.widgetTheme      = body.widgetTheme === "dark" ? "dark" : "light";
    if (body.widgetPosition   !== undefined) input.widgetPosition   = body.widgetPosition === "bottom-left" ? "bottom-left" : "bottom-right";
    if (body.widgetButtonSize   !== undefined) input.widgetButtonSize   = Math.min(Math.max(Number(body.widgetButtonSize), 40), 80);
    if (body.widgetBorderRadius !== undefined) input.widgetBorderRadius = Math.min(Math.max(Number(body.widgetBorderRadius), 0), 40);
    if (body.widgetFontFamily   !== undefined) input.widgetFontFamily   = String(body.widgetFontFamily).trim();
    if (body.widgetChatHeight   !== undefined) input.widgetChatHeight   = Math.min(Math.max(Number(body.widgetChatHeight), 300), 900);
    if (body.widgetShowBranding !== undefined) input.widgetShowBranding = Boolean(body.widgetShowBranding);
    if (body.widgetLauncherLabel !== undefined) input.widgetLauncherLabel = body.widgetLauncherLabel ? String(body.widgetLauncherLabel).trim() : null;

    const config = await patchAssistantConfig(kbId, input);
    if (!config) {
      return NextResponse.json(
        { error: "AssistantConfig not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(config);
  } catch (err) {
    console.error("[config] patchConfig:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
