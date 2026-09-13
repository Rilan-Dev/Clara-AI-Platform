import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { getOrganisationById } from "@/modules/organisations/core/db";
import {
  getOrgAISettings,
  upsertOrgAISettings,
} from "@/modules/organisations/core/ai-settings-db";
import type {
  AIProvider,
  PatchOrgAISettingsInput,
  ProviderScopedList,
} from "@/modules/ai-core/config-types";

function parseProvider(value: unknown): AIProvider | null {
  return value === "openai" || value === "gemini" ? value : null;
}

function parseProviderList(value: unknown): AIProvider[] | null {
  if (!Array.isArray(value)) return null;
  const providers = value
    .map((item) => parseProvider(item))
    .filter((item): item is AIProvider => item !== null);
  return providers.length > 0 ? providers : null;
}

function parseProviderScopedList(value: unknown): ProviderScopedList | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const scoped: ProviderScopedList = {};
  for (const provider of ["openai", "gemini"] as const) {
    const entries = record[provider];
    if (!Array.isArray(entries)) continue;
    scoped[provider] = entries
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return scoped;
}

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
  return typeof value === "boolean" ? value : undefined;
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

function buildPatchInput(body: Record<string, unknown>): PatchOrgAISettingsInput {
  const input: PatchOrgAISettingsInput = {};

  const defaultProvider = parseProvider(body.defaultProvider);
  if (body.defaultProvider === null || defaultProvider) input.defaultProvider = defaultProvider;

  const allowedProviders = parseProviderList(body.allowedProviders);
  if (allowedProviders) input.allowedProviders = allowedProviders;

  const allowedChatModels = parseProviderScopedList(body.allowedChatModels);
  if (allowedChatModels) input.allowedChatModels = allowedChatModels;

  const allowedEmbeddingModels = parseProviderScopedList(body.allowedEmbeddingModels);
  if (allowedEmbeddingModels) input.allowedEmbeddingModels = allowedEmbeddingModels;

  const allowedRealtimeModels = parseProviderScopedList(body.allowedRealtimeModels);
  if (allowedRealtimeModels) input.allowedRealtimeModels = allowedRealtimeModels;

  const allowedVoices = parseProviderScopedList(body.allowedVoices);
  if (allowedVoices) input.allowedVoices = allowedVoices;

  const defaultChatModel = parseOptionalString(body.defaultChatModel);
  if (defaultChatModel !== undefined) input.defaultChatModel = defaultChatModel;

  const defaultEmbeddingModel = parseOptionalString(body.defaultEmbeddingModel);
  if (defaultEmbeddingModel !== undefined) input.defaultEmbeddingModel = defaultEmbeddingModel;

  const defaultRealtimeModel = parseOptionalString(body.defaultRealtimeModel);
  if (defaultRealtimeModel !== undefined) input.defaultRealtimeModel = defaultRealtimeModel;

  const defaultTranscriptionModel = parseOptionalString(body.defaultTranscriptionModel);
  if (defaultTranscriptionModel !== undefined) {
    input.defaultTranscriptionModel = defaultTranscriptionModel;
  }

  const maxChatTokens = parseOptionalNumber(body.maxChatTokens);
  if (maxChatTokens !== undefined) input.maxChatTokens = maxChatTokens;

  const maxRealtimeTokens = parseOptionalNumber(body.maxRealtimeTokens);
  if (maxRealtimeTokens !== undefined) input.maxRealtimeTokens = maxRealtimeTokens;

  const maxTemperature = parseOptionalNumber(body.maxTemperature);
  if (maxTemperature !== undefined) input.maxTemperature = maxTemperature;

  const enablePublicEmbed = parseOptionalBoolean(body.enablePublicEmbed);
  if (enablePublicEmbed !== undefined) input.enablePublicEmbed = enablePublicEmbed;

  const enableVoice = parseOptionalBoolean(body.enableVoice);
  if (enableVoice !== undefined) input.enableVoice = enableVoice;

  const enableRealtime = parseOptionalBoolean(body.enableRealtime);
  if (enableRealtime !== undefined) input.enableRealtime = enableRealtime;

  // Identity
  const assistantName = parseOptionalString(body.assistantName);
  if (assistantName !== undefined) input.assistantName = assistantName;

  const avatarUrl = parseOptionalString(body.avatarUrl);
  if (avatarUrl !== undefined) input.avatarUrl = avatarUrl;

  // Behaviour
  const systemPrompt = parseOptionalString(body.systemPrompt);
  if (systemPrompt !== undefined) input.systemPrompt = systemPrompt;

  const welcomeMessage = parseOptionalString(body.welcomeMessage);
  if (welcomeMessage !== undefined) input.welcomeMessage = welcomeMessage;

  const outOfScopeReply = parseOptionalString(body.outOfScopeReply);
  if (outOfScopeReply !== undefined) input.outOfScopeReply = outOfScopeReply;

  const rules = parseOptionalStringArray(body.rules);
  if (rules !== undefined) input.rules = rules;

  // Language
  const defaultLanguage = parseOptionalString(body.defaultLanguage);
  if (defaultLanguage !== undefined) input.defaultLanguage = defaultLanguage;

  const allowedLanguages = parseOptionalStringArray(body.allowedLanguages);
  if (allowedLanguages !== undefined) input.allowedLanguages = allowedLanguages;

  const alwaysRespondIn = parseOptionalString(body.alwaysRespondIn);
  if (alwaysRespondIn !== undefined) input.alwaysRespondIn = alwaysRespondIn;

  // Voice
  const voiceId = parseOptionalString(body.voiceId);
  if (voiceId !== undefined) input.voiceId = voiceId;

  const voiceSpeed = parseOptionalNumber(body.voiceSpeed);
  if (voiceSpeed !== undefined) input.voiceSpeed = voiceSpeed;

  return input;
}

export async function getOrgAISettingsHandler(
  req: NextRequest,
  orgId: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) {
      return NextResponse.json(
        { error: "AI configuration is managed by each organisation. Platform admins only see aggregate counts." },
        { status: 403 },
      );
    }
    await requireOrgPermission(auth, orgId, "org:read");

    const org = await getOrganisationById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }

    const settings = await getOrgAISettings(orgId);
    if (!settings) {
      return NextResponse.json({ error: "Org AI settings not found" }, { status: 404 });
    }

    return NextResponse.json(settings);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function patchOrgAISettingsHandler(
  req: NextRequest,
  orgId: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) {
      return NextResponse.json(
        { error: "AI configuration is managed by each organisation. Platform admins only see aggregate counts." },
        { status: 403 },
      );
    }
    await requireOrgPermission(auth, orgId, "org:update");

    const org = await getOrganisationById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Organisations own their full AI configuration — provider, model,
    // identity, behaviour, language and voice alike. Platform admins are
    // locked out entirely, so no field is centrally restricted any more.
    const input = buildPatchInput(body);
    const settings = await upsertOrgAISettings(orgId, input);
    return NextResponse.json(settings);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org-ai-settings] patch:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
