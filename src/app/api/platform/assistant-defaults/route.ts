import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import {
  getPlatformAssistantDefaults,
  updatePlatformAssistantDefaults,
} from "@/modules/ai-core/assistant-defaults-db";
import { invalidateOpenAICatalogCache } from "@/modules/assistant/api/openai-catalog-cache";

/**
 * Platform assistant defaults (Identity / Behaviour / Language / Voice).
 *
 * Super-admin only — this is the platform-level configuration surfaced in
 * Settings -> AI Configuration. These values are seeded onto newly created
 * projects / knowledge bases / agents; existing rows are never rewritten.
 */

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

function parseOptionalStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const defaults = await getPlatformAssistantDefaults();
    return NextResponse.json(defaults);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[GET /api/platform/assistant-defaults]", err);
    return NextResponse.json(
      { error: "Failed to load platform assistant defaults" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const assistantName = parseOptionalString(body.assistantName);
    const defaultLanguage = parseOptionalString(body.defaultLanguage);
    if (assistantName === null) return badRequest("assistantName cannot be empty");
    if (defaultLanguage === null) return badRequest("defaultLanguage cannot be empty");

    const allowedLanguages = parseOptionalStringArray(body.allowedLanguages);
    if (allowedLanguages !== null && allowedLanguages !== undefined && allowedLanguages.length === 0) {
      return badRequest("allowedLanguages must have at least one language");
    }

    const voiceSpeed = parseOptionalNumber(body.voiceSpeed);
    if (voiceSpeed != null && (voiceSpeed < 0.25 || voiceSpeed > 4.0)) {
      return badRequest("voiceSpeed must be between 0.25 and 4.0");
    }

    const temperature = parseOptionalNumber(body.temperature);
    if (temperature != null && (temperature < 0 || temperature > 1)) {
      return badRequest("temperature must be between 0 and 1");
    }
    const maxTokens = parseOptionalNumber(body.maxTokens);
    if (maxTokens != null && (maxTokens < 50 || maxTokens > 4000)) {
      return badRequest("maxTokens must be between 50 and 4000");
    }

    const rules = parseOptionalStringArray(body.rules);
    if (rules === null) return badRequest("rules cannot be null — use an empty list");

    const defaults = await updatePlatformAssistantDefaults(
      {
        assistantName: assistantName ?? undefined,
        avatarUrl: parseOptionalString(body.avatarUrl),
        systemPrompt: parseOptionalString(body.systemPrompt) ?? undefined,
        welcomeMessage: parseOptionalString(body.welcomeMessage) ?? undefined,
        outOfScopeReply: parseOptionalString(body.outOfScopeReply) ?? undefined,
        rules: rules ?? undefined,
        defaultLanguage: defaultLanguage ?? undefined,
        allowedLanguages: allowedLanguages ?? undefined,
        alwaysRespondIn: parseOptionalString(body.alwaysRespondIn),
        voiceId: parseOptionalString(body.voiceId),
        voiceSpeed: voiceSpeed === undefined ? undefined : voiceSpeed,
        temperature: temperature == null ? undefined : temperature,
        maxTokens: maxTokens == null ? undefined : maxTokens,
        citeSources: parseOptionalBoolean(body.citeSources),
        strictMode: parseOptionalBoolean(body.strictMode),
        primaryColour: parseOptionalString(body.primaryColour) ?? undefined,
        accentColour: parseOptionalString(body.accentColour) ?? undefined,
        launcherColour: parseOptionalString(body.launcherColour),
      },
      auth.user.id,
    );
    // Default voice / language changes should be reflected in the Voice tab
    // on the next visit, so reset its Redis catalog cache (best-effort).
    if (body.voiceId !== undefined || body.voiceSpeed !== undefined) {
      try { await invalidateOpenAICatalogCache(); } catch { /* best-effort */ }
    }
    return NextResponse.json(defaults);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[PATCH /api/platform/assistant-defaults]", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to save platform assistant defaults" },
      { status: 500 },
    );
  }
}
