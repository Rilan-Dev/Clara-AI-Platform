import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { getOrganisationById } from "@/modules/organisations/core/db";
import {
  getOrgAISettings,
} from "@/modules/organisations/core/ai-settings-db";
import { isVoiceProvider, type VoiceProvider } from "@/modules/voice-core/types";
import {
  ELEVENLABS_TTS_MODELS,
  isSupportedTTSModel,
  SARVAM_TTS_MODELS,
  SARVAM_STT_MODELS,
  isSupportedSarvamTTSModel,
  isSupportedSarvamSTTModel,
  isSupportedSarvamSpeaker,
} from "@/modules/voice-core/model-catalog";
import type {
  AIProvider,
  PatchOrgAISettingsInput,
  ProviderScopedList,
} from "@/modules/ai-core/config-types";

function parseProvider(value: unknown): AIProvider | null {
  return value === "openai" || value === "gemini" || value === "sarvam" ? value : null;
}

function parseVoiceProvider(value: unknown): VoiceProvider | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isVoiceProvider(value) ? value : undefined;
}

function parseVoiceProviderList(value: unknown): VoiceProvider[] | null {
  if (!Array.isArray(value)) return null;
  const providers = value
    .map((item) => (isVoiceProvider(item) ? item : null))
    .filter((item): item is VoiceProvider => item !== null);
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
  for (const provider of ["openai", "gemini", "sarvam"] as const) {
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

  // ── Realtime voice-assistant purpose (floating voice modal, embed voice,
  // Agents, phone). NULL = inherit the voice-chat provider — the default that
  // keeps every surface native to the picked chat provider. ──
  const realtimeVoiceProvider = parseVoiceProvider(body.realtimeVoiceProvider);
  if (realtimeVoiceProvider !== undefined) input.realtimeVoiceProvider = realtimeVoiceProvider;

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

  // ── Sarvam voice defaults (migration 036 columns — validated against the
  // static catalogue exactly like the ElevenLabs models above). ──
  const sarvamTtsModel = parseOptionalString(body.sarvamTtsModel);
  if (sarvamTtsModel !== undefined) {
    if (sarvamTtsModel && !isSupportedSarvamTTSModel(sarvamTtsModel)) {
      throw new Error(
        `Unsupported Sarvam TTS model "${sarvamTtsModel}". Choose one of: ${SARVAM_TTS_MODELS.map((m) => m.modelId).join(", ")}.`,
      );
    }
    input.sarvamTtsModel = sarvamTtsModel;
  }

  const sarvamSttModel = parseOptionalString(body.sarvamSttModel);
  if (sarvamSttModel !== undefined) {
    if (sarvamSttModel && !isSupportedSarvamSTTModel(sarvamSttModel)) {
      throw new Error(
        `Unsupported Sarvam STT model "${sarvamSttModel}". Choose one of: ${SARVAM_STT_MODELS.map((m) => m.modelId).join(", ")}.`,
      );
    }
    input.sarvamSttModel = sarvamSttModel;
  }

  const defaultSarvamSpeaker = parseOptionalString(body.defaultSarvamSpeaker);
  if (defaultSarvamSpeaker !== undefined) {
    if (defaultSarvamSpeaker && !isSupportedSarvamSpeaker(defaultSarvamSpeaker)) {
      throw new Error(`Unsupported Sarvam speaker "${defaultSarvamSpeaker}". Choose a Bulbul speaker from the catalogue.`);
    }
    input.defaultSarvamSpeaker = defaultSarvamSpeaker;
  }

  if (body.translationMode !== undefined) {
    input.translationMode =
      body.translationMode === "query" || body.translationMode === "query+answer"
        ? body.translationMode
        : "off";
  }

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

    // ── STAGE J: legacy organisation AI settings writes are FROZEN ─────────
    // Provider infrastructure (API keys, enable/disable, health, model
    // catalogue) is owned by the Platform Admin in Settings → AI Platform →
    // Providers & Models. Agent-level AI selection is owned inside each
    // agent's workspace (Assistant & AI). This endpoint no longer accepts
    // mutations — the explicit migration response below directs callers to
    // the right surface instead of silently ignoring their writes.
    void buildPatchInput; // parser retained for the GET contract & rollforward
    return NextResponse.json(
      {
        error:
          "Organisation-level AI provider configuration has been migrated. Provider infrastructure is managed by the platform admin (Settings → AI Platform → Providers & Models); agent AI selection is configured inside each agent (Assistant & AI).",
        code: "AI_SETTINGS_MIGRATED",
        migratedAt: "2026-09-20",
        redirectTo: [
          "/settings/ai — platform AI Providers & Models and Default Assistant (platform admin)",
          "/orgs/<orgId>/agents/<agentId> — agent Assistant & AI workspace (organisation)",
        ],
      },
      { status: 410 },
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[org-ai-settings] patch:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
