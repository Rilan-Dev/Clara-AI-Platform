import { getProjectById } from "@/modules/organisations/core/db";
import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getProjectAISettings } from "@/modules/organisations/core/project-ai-settings-db";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import { getActiveAgentForProject } from "@/modules/agents/core/db";
import type { Agent } from "@/modules/agents/core/models";
import type { AssistantConfig } from "@/modules/knowledge-bases/core/models";
import type { ProviderConfig } from "@/modules/ai-core/types";
import type {
  AIProvider,
  AISurface,
  PlatformAIDefaults,
  ProviderScopedList,
  ResolveAIConfigInput,
  ResolvedAIConfig,
} from "./config-types";
import type { ProjectAISettings } from "@/modules/organisations/core/project-ai-types";
import { resolveProjectRuntimeSelection } from "@/modules/organisations/core/project-ai-types";

export class AIConfigResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigResolutionError";
  }
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPlatformAIDefaults(): PlatformAIDefaults {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const normalizedProvider: AIProvider = provider === "gemini" ? "gemini" : "openai";

  return {
    provider: normalizedProvider,
    models: {
      openai: {
        chat: process.env.OPENAI_CHAT_MODEL?.trim() || null,
        embedding: process.env.OPENAI_EMBEDDING_MODEL?.trim() || null,
        realtime: process.env.OPENAI_REALTIME_MODEL?.trim() || null,
        transcription: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || null,
        defaultVoice: process.env.OPENAI_DEFAULT_VOICE?.trim() || null,
      },
      gemini: {
        chat: process.env.GEMINI_CHAT_MODEL?.trim() || null,
        embedding: process.env.GEMINI_EMBEDDING_MODEL?.trim() || null,
        realtime: process.env.GEMINI_REALTIME_MODEL?.trim() || null,
        transcription: process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || null,
        defaultVoice: process.env.GEMINI_DEFAULT_VOICE?.trim() || null,
      },
    },
    limits: {
      chatMaxTokens: parsePositiveInt(process.env.AI_MAX_CHAT_TOKENS),
      realtimeMaxTokens: parsePositiveInt(process.env.AI_MAX_REALTIME_TOKENS),
      maxTemperature: parseNumber(process.env.AI_MAX_TEMPERATURE),
    },
  };
}

function getAllowedValues(map: ProviderScopedList | undefined, provider: AIProvider): string[] | null {
  const values = map?.[provider];
  return Array.isArray(values) && values.length > 0 ? values : null;
}

function pickAllowedString(
  candidate: string | null | undefined,
  allowed: string[] | null,
  fallback: string | null,
): string | null {
  if (!allowed || allowed.length === 0) return candidate ?? fallback ?? null;
  if (candidate && allowed.includes(candidate)) return candidate;
  if (fallback && allowed.includes(fallback)) return fallback;
  return allowed[0] ?? null;
}

function clampNumber(value: number | null, max: number | null): number | null {
  if (value == null || max == null) return value;
  return Math.min(value, max);
}

// OpenAI Realtime `audio.output.voice` accepts voice IDs, not model names.
// Keep this validation at the shared AI configuration boundary so every
// Realtime/embed caller is protected from stale or invalid project settings.
const OPENAI_REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

function normalizeRealtimeVoice(
  provider: AIProvider,
  candidate: string | null,
  organisationVoices: string[],
  platformVoice: string | null,
): string | null {
  if (provider !== "openai") return candidate;

  if (candidate && OPENAI_REALTIME_VOICES.has(candidate)) return candidate;

  const configuredFallback = organisationVoices.find((voice) => OPENAI_REALTIME_VOICES.has(voice));
  if (configuredFallback) return configuredFallback;

  if (platformVoice && OPENAI_REALTIME_VOICES.has(platformVoice)) return platformVoice;

  // Safe OpenAI Realtime fallback. This is deliberately only used when no
  // valid OpenAI voice is configured; values such as `gpt-realtime-whisper`
  // are model identifiers and must never be sent as output voices.
  return "alloy";
}

function assertSurfaceEnabled(surface: AISurface, flags: ResolvedAIConfig["flags"]): void {
  if (surface === "realtime" || surface === "embed") {
    if (!flags.voiceEnabled) throw new AIConfigResolutionError("Voice is disabled for this knowledge base.");
    if (!flags.realtimeEnabled) throw new AIConfigResolutionError("Realtime is disabled for this organisation.");
  }
  if (surface === "embed" && !flags.publicEmbedEnabled) {
    throw new AIConfigResolutionError("Public embed is disabled for this knowledge base.");
  }
}

/**
 * Overlay the project's active agent onto the KB assistant config.
 * Agent-sourced identity / behaviour / language / voice / generation settings
 * become the effective assistant config; null agent fields fall back to the
 * KB config, which in turn falls back to org/platform defaults.
 */
function applyAgentOverlay(
  base: AssistantConfig | null,
  agent: Agent | null,
): AssistantConfig | null {
  if (!agent || !base) return base;
  return {
    ...base,
    assistantName: agent.assistantName || base.assistantName,
    avatarUrl: agent.avatarUrl ?? base.avatarUrl,
    systemPrompt: agent.systemPrompt?.trim() ? agent.systemPrompt : base.systemPrompt,
    welcomeMessage: agent.welcomeMessage?.trim() ? agent.welcomeMessage : base.welcomeMessage,
    outOfScopeReply: agent.outOfScopeReply?.trim() ? agent.outOfScopeReply : base.outOfScopeReply,
    rules: agent.rules?.length ? agent.rules : base.rules,
    defaultLanguage: agent.defaultLanguage || base.defaultLanguage,
    allowedLanguages: agent.allowedLanguages?.length ? agent.allowedLanguages : base.allowedLanguages,
    alwaysRespondIn: agent.alwaysRespondIn ?? base.alwaysRespondIn,
    voiceId: agent.voiceId ?? base.voiceId,
    speed: agent.speed ?? base.speed,
    temperature: agent.temperature ?? base.temperature,
    maxTokens: agent.maxTokens ?? base.maxTokens,
    citeSources: agent.citeSources ?? base.citeSources,
    strictMode: agent.strictMode ?? base.strictMode,
  };
}

/**
 * Resolve tenant AI settings with project -> org -> platform precedence for
 * provider/model infrastructure and KB assistant config for user-facing
 * language and voice preferences. When the KB's project has an active agent,
 * the agent's settings take precedence over the KB assistant config.
 */
export async function resolveAIConfig(input: ResolveAIConfigInput): Promise<ResolvedAIConfig> {
  const defaults = getPlatformAIDefaults();
  const kb = input.kbId ? await getKnowledgeBaseById(input.kbId) : null;
  const project = kb ? await getProjectById(kb.projectId) : null;
  const orgId = input.orgId ?? project?.orgId ?? null;

  const [orgSettings, projectSettings, kbOverrides, assistantConfigBase, activeAgent] = await Promise.all([
    orgId ? getOrgAISettings(orgId) : Promise.resolve(null),
    project?.id ? getProjectAISettings(project.id) : Promise.resolve(null),
    input.kbId ? getKbAIOverrides(input.kbId) : Promise.resolve(null),
    input.kbId ? getAssistantConfig(input.kbId) : Promise.resolve(null),
    project?.id ? getActiveAgentForProject(project.id) : Promise.resolve(null),
  ]);

  const assistantConfig = applyAgentOverlay(assistantConfigBase, activeAgent);

  if (projectSettings && project && projectSettings.orgId !== project.orgId) {
    throw new AIConfigResolutionError("Project AI configuration belongs to another organisation.");
  }

  let provider: AIProvider = projectSettings?.provider ?? orgSettings?.defaultProvider ?? defaults.provider;
  let providerSource: ResolvedAIConfig["sources"]["provider"] = projectSettings?.provider
    ? "project"
    : orgSettings?.defaultProvider
      ? "org"
      : "env";

  if (kbOverrides?.provider) {
    provider = kbOverrides.provider;
    providerSource = "kb_override";
  }

  const allowedProviders = orgSettings?.allowedProviders?.length
    ? orgSettings.allowedProviders
    : (["openai", "gemini"] as AIProvider[]);

  if (!allowedProviders.includes(provider)) {
    throw new AIConfigResolutionError(`Project provider ${provider} is not enabled for this organisation.`);
  }

  const defaultChat = defaults.models[provider].chat;
  const defaultEmbedding = defaults.models[provider].embedding;
  const defaultRealtime = defaults.models[provider].realtime;
  const defaultTranscription = defaults.models[provider].transcription;
  const defaultVoice = defaults.models[provider].defaultVoice;

  const chatCandidate =
    kbOverrides?.chatModel ?? activeAgent?.chatModel ?? projectSettings?.chatModel ?? orgSettings?.defaultChatModel ?? defaultChat;
  const embeddingCandidate =
    kbOverrides?.embeddingModel ?? projectSettings?.embeddingModel ?? orgSettings?.defaultEmbeddingModel ?? defaultEmbedding;
  const realtimeCandidate =
    kbOverrides?.realtimeModel ?? projectSettings?.realtimeModel ?? orgSettings?.defaultRealtimeModel ?? defaultRealtime;
  const transcriptionCandidate =
    kbOverrides?.transcriptionModel ??
    projectSettings?.transcriptionModel ??
    orgSettings?.defaultTranscriptionModel ??
    defaultTranscription;

  const chatModel = pickAllowedString(
    chatCandidate,
    getAllowedValues(orgSettings?.allowedChatModels, provider),
    defaultChat,
  );
  const embeddingModel = pickAllowedString(
    embeddingCandidate,
    getAllowedValues(orgSettings?.allowedEmbeddingModels, provider),
    defaultEmbedding,
  );
  const realtimeModel = pickAllowedString(
    realtimeCandidate,
    getAllowedValues(orgSettings?.allowedRealtimeModels, provider),
    defaultRealtime,
  );

  const fallbackLanguageCode = process.env.DEFAULT_LANGUAGE_CODE?.trim().toLowerCase() || "en";

  // Keep the complete organisation voice allow-list available so an assistant
  // can select any valid configured voice, not only the first organisation voice.
  const organisationFallbackVoices = getAllowedValues(orgSettings?.allowedVoices, provider) ?? [];
  const fallbackVoiceId = organisationFallbackVoices[0] ?? defaultVoice;

  const runtimeProjectSettings: ProjectAISettings = projectSettings
    ? {
        ...projectSettings,
        voices:
          projectSettings.voices.length > 0 || !fallbackVoiceId
            ? projectSettings.voices
            : [
                {
                  id: "platform-default-voice",
                  orgId: orgId ?? "",
                  provider,
                  voiceId: fallbackVoiceId,
                  name: fallbackVoiceId,
                  enabled: true,
                  metadata: { source: organisationFallbackVoices.length > 0 ? "organisation-default" : "platform-default" },
                },
              ],
      }
    : {
        id: "platform-default",
        projectId: project?.id ?? "",
        orgId: orgId ?? "",
        provider,
        chatModel: null,
        embeddingModel: null,
        realtimeModel: null,
        transcriptionModel: null,
        defaultLanguageId: "platform-default-language",
        defaultVoiceId: fallbackVoiceId ? "platform-default-voice" : null,
        languages: [
          {
            id: "platform-default-language",
            orgId: orgId ?? "",
            code: fallbackLanguageCode,
            name: fallbackLanguageCode === "en" ? "English" : fallbackLanguageCode,
            nativeName: null,
            enabled: true,
          },
        ],
        voices: fallbackVoiceId
          ? [
              {
                id: "platform-default-voice",
                orgId: orgId ?? "",
                provider,
                voiceId: fallbackVoiceId,
                name: fallbackVoiceId,
                enabled: true,
                metadata: { source: organisationFallbackVoices.length > 0 ? "organisation-default" : "platform-default" },
              },
            ]
          : [],
      };

  const projectSelection = resolveProjectRuntimeSelection({
    provider,
    assistantLanguage: assistantConfig?.alwaysRespondIn ?? assistantConfig?.defaultLanguage,
    assistantAllowedLanguages: assistantConfig?.allowedLanguages,
    assistantVoice: assistantConfig?.voiceId,
    assignedLanguages: runtimeProjectSettings.languages,
    assignedVoices: runtimeProjectSettings.voices,
    defaultLanguageCode:
      runtimeProjectSettings.languages.find(
        (item) => item.id === runtimeProjectSettings.defaultLanguageId,
      )?.code ?? null,
    defaultVoice: (() => {
      const item = runtimeProjectSettings.voices.find(
        (voice) => voice.id === runtimeProjectSettings.defaultVoiceId,
      );
      return item ? { provider: item.provider, voiceId: item.voiceId } : null;
    })(),
  });

  if (projectSelection.allowedLanguages.length === 0) {
    throw new AIConfigResolutionError("No languages are configured for this assistant.");
  }

  const voiceId =
    input.surface === "realtime" || input.surface === "embed"
      ? normalizeRealtimeVoice(provider, projectSelection.voiceId, organisationFallbackVoices, defaultVoice)
      : null;

  if ((input.surface === "realtime" || input.surface === "embed") && !voiceId) {
    throw new AIConfigResolutionError(`No ${provider} voice is configured for this project or platform.`);
  }

  const flags = {
    voiceEnabled: (orgSettings?.enableVoice ?? true) && !(kbOverrides?.disableVoice ?? false),
    realtimeEnabled: orgSettings?.enableRealtime ?? true,
    publicEmbedEnabled:
      (orgSettings?.enablePublicEmbed ?? true) && !(kbOverrides?.disablePublicEmbed ?? false),
  };
  assertSurfaceEnabled(input.surface, flags);

  const temperature = clampNumber(
    assistantConfig?.temperature ?? null,
    orgSettings?.maxTemperature ?? defaults.limits.maxTemperature,
  );
  const maxTokensCap =
    input.surface === "chat"
      ? orgSettings?.maxChatTokens ?? defaults.limits.chatMaxTokens
      : orgSettings?.maxRealtimeTokens ?? defaults.limits.realtimeMaxTokens;
  const maxTokens = clampNumber(assistantConfig?.maxTokens ?? maxTokensCap, maxTokensCap);

  if (input.surface === "chat" && !chatModel) {
    throw new AIConfigResolutionError("No chat model is configured for this tenant.");
  }
  if (input.surface === "rag-embedding" && !embeddingModel) {
    throw new AIConfigResolutionError("No embedding model is configured for this tenant.");
  }
  if ((input.surface === "realtime" || input.surface === "embed") && !realtimeModel) {
    throw new AIConfigResolutionError("No realtime model is configured for this tenant.");
  }

  return {
    orgId,
    projectId: project?.id ?? null,
    kbId: input.kbId ?? null,
    provider,
    chatModel,
    embeddingModel,
    realtimeModel,
    transcriptionModel: transcriptionCandidate ?? null,
    voiceId,
    allowedLanguages: projectSelection.allowedLanguages,
    defaultLanguage: projectSelection.defaultLanguage,
    temperature,
    maxTokens,
    assistantConfig,
    flags,
    sources: {
      provider: providerSource,
      chatModel:
        kbOverrides?.chatModel != null
          ? "kb_override"
          : activeAgent?.chatModel != null
            ? "agent"
            : projectSettings?.chatModel != null
              ? "project"
              : orgSettings?.defaultChatModel != null
                ? "org"
                : "env",
      embeddingModel:
        kbOverrides?.embeddingModel != null
          ? "kb_override"
          : projectSettings?.embeddingModel != null
            ? "project"
            : orgSettings?.defaultEmbeddingModel != null
              ? "org"
              : "env",
      realtimeModel:
        kbOverrides?.realtimeModel != null
          ? "kb_override"
          : projectSettings?.realtimeModel != null
            ? "project"
            : orgSettings?.defaultRealtimeModel != null
              ? "org"
              : "env",
      transcriptionModel:
        kbOverrides?.transcriptionModel != null
          ? "kb_override"
          : projectSettings?.transcriptionModel != null
            ? "project"
            : orgSettings?.defaultTranscriptionModel != null
              ? "org"
              : "env",
      voiceId:
        activeAgent?.voiceId
          ? "agent"
          : assistantConfig?.voiceId
            ? "assistant_config"
            : projectSettings?.voices?.length
              ? "project"
              : organisationFallbackVoices.length > 0
                ? "org"
                : defaultVoice
                  ? "env"
                  : null,
      temperature:
        activeAgent?.temperature != null
          ? "agent"
          : assistantConfig?.temperature != null
            ? "assistant_config"
            : orgSettings?.maxTemperature != null
              ? "org"
              : defaults.limits.maxTemperature != null
                ? "env"
                : null,
      maxTokens:
        activeAgent?.maxTokens != null
          ? "agent"
          : assistantConfig?.maxTokens != null
            ? "assistant_config"
            : orgSettings?.maxRealtimeTokens != null || orgSettings?.maxChatTokens != null
              ? "org"
              : defaults.limits.realtimeMaxTokens != null || defaults.limits.chatMaxTokens != null
                ? "env"
                : null,
    },
  };
}

export function getProviderApiKey(provider: AIProvider): string | undefined {
  const envKey = provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
  const value = process.env[envKey]?.trim();
  return value || undefined;
}

export function toProviderConfig(resolved: ResolvedAIConfig): ProviderConfig {
  const embeddingDimension = Number(
    process.env[`${resolved.provider.toUpperCase()}_EMBEDDING_DIMENSION`],
  );
  return {
    provider: resolved.provider,
    apiKey: getProviderApiKey(resolved.provider),
    chatModel: resolved.chatModel ?? undefined,
    embeddingModel: resolved.embeddingModel ?? undefined,
    embeddingDimension:
      Number.isFinite(embeddingDimension) && embeddingDimension > 0
        ? embeddingDimension
        : undefined,
  };
}