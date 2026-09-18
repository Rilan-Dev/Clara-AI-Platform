import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { getOrganisationById } from "@/modules/organisations/core/db";
import {
  getOrgAISettings,
  upsertOrgAISettings,
} from "@/modules/organisations/core/ai-settings-db";
import { isVoiceProvider } from "@/modules/voice-core/types";
import {
  ELEVENLABS_TTS_MODELS,
  isSupportedTTSModel,
} from "@/modules/voice-core/model-catalog";
import type {
  AIProvider,
  PatchOrgAISettingsInput,
  ProviderScopedList,
} from "@/modules/ai-core/config-types";

function parseProvider(value: unknown): AIProvider | null {
  return value === "openai" || value === "gemini" ? value : null;
}

function parseVoiceProvider(value: unknown): "openai" | "gemini" | "elevenlabs" | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isVoiceProvider(value) ? value : undefined;
}

function parseVoiceProviderList(value: unknown): ("openai" | "gemini" | "elevenlabs")[] | null {
  if (!Array.isArray(value)) return null;
  const providers = value
    .map((item) => (isVoiceProvider(item) ? item : null))
    .filter((item): item is "openai" | "gemini" | "elevenlabs" => item !== null);
  return providers.length > 0 ? providers : null;
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

function buildPatchInput(body: Record<string, unknown>): PatchOrgAISettingsInput {
  const input: PatchOrgAISettingsInput = {};

  const defaultProvider = parseProvider(body.defaultProvider);
  if (body.defaultProvider === null || defaultProvider) input.defaultProvider = defaultProvider;

  const allowedProviders = parseProviderList(body.allowedProviders);
  if (allowedProviders) input.allowedProviders = allowedProviders;

  // ── Voice-provider axis (ElevenLabs) ──
  const voiceProvider = parseVoiceProvider(body.voiceProvider);
  if (voiceProvider !== undefined) input.voiceProvider = voiceProvider;

  const allowedVoiceProviders = parseVoiceProviderList(body.allowedVoiceProviders);
  if (allowedVoiceProviders) input.allowedVoiceProviders = allowedVoiceProviders;

  const elevenlabsTtsModel = parseOptionalString(body.elevenlabsTtsModel);
  if (elevenlabsTtsModel !== undefined) {
    if (elevenlabsTtsModel && !isSupportedTTSModel(elevenlabsTtsModel)) {
      throw new Error(
        `Unsupported ElevenLabs TTS model "${elevenlabsTtsModel}". Choose one of: ${ELEVENLABS_TTS_MODELS.map((m) => m.modelId).join(", ")}.`,
      );
    }
    input.elevenlabsTtsModel = elevenlabsTtsModel;
  }

  const elevenlabsSttModel = parseOptionalString(body.elevenlabsSttModel);
  if (elevenlabsSttModel !== undefined) input.elevenlabsSttModel = elevenlabsSttModel;

  const defaultElevenlabsVoice = parseOptionalString(body.defaultElevenlabsVoice);
  if (defaultElevenlabsVoice !== undefined) input.defaultElevenlabsVoice = defaultElevenlabsVoice;

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

  // NOTE: Identity / Behaviour / Language / Voice fields (assistantName,
  // avatarUrl, systemPrompt, welcomeMessage, outOfScopeReply, rules,
  // defaultLanguage, allowedLanguages, alwaysRespondIn, voiceId, voiceSpeed)
  // are intentionally NOT accepted any more. They are platform-level
  // defaults now (Settings → AI Configuration) and are seeded onto newly
  // created projects / KBs / agents. Organisations keep the values already
  // stored on their own projects, agents and knowledge bases.

  return input;
}

export async function getOrgAISettingsHandler(
  req: NextRequest,
  orgId: string,
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    // Platform admins manage org AI configuration from the admin console
    // (org detail → AI settings); org users need org:read.
    if (!auth.user.isSuperAdmin) {
      await requireOrgPermission(auth, orgId, "org:read");
    }

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
    // Platform admins manage org AI configuration from the admin console;
    // org users need org:update.
    if (!auth.user.isSuperAdmin) {
      await requireOrgPermission(auth, orgId, "org:update");
    }

    const org = await getOrganisationById(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Organisations own their AI model / provider / limit configuration.
    // Identity, Behaviour, Language and Voice are platform-level defaults
    // now — the org PATCH intentionally ignores those fields.
    let input: PatchOrgAISettingsInput;
    try {
      input = buildPatchInput(body);
    } catch (validationError) {
      return NextResponse.json({ error: (validationError as Error).message }, { status: 400 });
    }
    const settings = await upsertOrgAISettings(orgId, input);
    return NextResponse.json(settings);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org-ai-settings] patch:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
