import { getProjectById } from "@/modules/organisations/core/db";
import { getOrgAISettings } from "@/modules/organisations/core/ai-settings-db";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getKbAIOverrides } from "@/modules/knowledge-bases/core/ai-overrides-db";
import type { ProviderConfig } from "@/modules/ai-core/types";
import type {
  AIProvider,
  AISurface,
  PlatformAIDefaults,
  ProviderScopedList,
  ResolveAIConfigInput,
  ResolvedAIConfig,
} from "./config-types";

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
        transcription: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() || null,
        defaultVoice: process.env.OPENAI_REALTIME_VOICE?.trim() || null,
      },
      gemini: {
        chat: process.env.GEMINI_CHAT_MODEL?.trim() || null,
        embedding: process.env.GEMINI_EMBEDDING_MODEL?.trim() || null,
        realtime: process.env.GEMINI_LIVE_MODEL?.trim() || null,
        transcription: null,
        defaultVoice: process.env.GEMINI_LIVE_VOICE?.trim() || null,
      },
    },
    limits: {
      chatMaxTokens: parsePositiveInt(process.env.OPENAI_CHAT_MAX_TOKENS),
      realtimeMaxTokens: parsePositiveInt(process.env.OPENAI_REALTIME_MAX_TOKENS),
      maxTemperature: parseNumber(process.env.OPENAI_REALTIME_TEMPERATURE),
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
  if (value == null) return null;
  if (max == null) return value;
  return Math.min(value, max);
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

export async function resolveAIConfig(input: ResolveAIConfigInput): Promise<ResolvedAIConfig> {
  const defaults = getPlatformAIDefaults();
  const kb = input.kbId ? await getKnowledgeBaseById(input.kbId) : null;
  const project = kb ? await getProjectById(kb.projectId) : null;
  const orgId = input.orgId ?? project?.orgId ?? null;

  const [orgSettings, kbOverrides, assistantConfig] = await Promise.all([
    orgId ? getOrgAISettings(orgId) : Promise.resolve(null),
    input.kbId ? getKbAIOverrides(input.kbId) : Promise.resolve(null),
    input.kbId ? getAssistantConfig(input.kbId) : Promise.resolve(null),
  ]);

  let provider: AIProvider = defaults.provider;
  let providerSource: ResolvedAIConfig["sources"]["provider"] = "env";
  if (orgSettings?.defaultProvider) {
    provider = orgSettings.defaultProvider;
    providerSource = "org";
  }
  if (kbOverrides?.provider) {
    provider = kbOverrides.provider;
    providerSource = "kb_override";
  }

  const allowedProviders = orgSettings?.allowedProviders?.length
    ? orgSettings.allowedProviders
    : (["openai", "gemini"] as AIProvider[]);
  if (!allowedProviders.includes(provider)) {
    provider = allowedProviders[0] ?? defaults.provider;
    providerSource = "org";
  }

  const defaultChat = defaults.models[provider].chat;
  const defaultEmbedding = defaults.models[provider].embedding;
  const defaultRealtime = defaults.models[provider].realtime;
  const defaultTranscription = defaults.models[provider].transcription;
  const defaultVoice = defaults.models[provider].defaultVoice;

  const chatCandidate = kbOverrides?.chatModel ?? orgSettings?.defaultChatModel ?? defaultChat;
  const embeddingCandidate = kbOverrides?.embeddingModel ?? orgSettings?.defaultEmbeddingModel ?? defaultEmbedding;
  const realtimeCandidate = kbOverrides?.realtimeModel ?? orgSettings?.defaultRealtimeModel ?? defaultRealtime;
  const transcriptionCandidate = kbOverrides?.transcriptionModel ?? orgSettings?.defaultTranscriptionModel ?? defaultTranscription;

  const chatModel = pickAllowedString(chatCandidate, getAllowedValues(orgSettings?.allowedChatModels, provider), defaultChat);
  const embeddingModel = pickAllowedString(embeddingCandidate, getAllowedValues(orgSettings?.allowedEmbeddingModels, provider), defaultEmbedding);
  const realtimeModel = pickAllowedString(realtimeCandidate, getAllowedValues(orgSettings?.allowedRealtimeModels, provider), defaultRealtime);
  const voiceId = input.surface === "realtime" || input.surface === "embed"
    ? pickAllowedString(assistantConfig?.voiceId ?? defaultVoice, getAllowedValues(orgSettings?.allowedVoices, provider), defaultVoice)
    : null;

  const flags = {
    voiceEnabled: (orgSettings?.enableVoice ?? true) && !(kbOverrides?.disableVoice ?? false),
    realtimeEnabled: orgSettings?.enableRealtime ?? true,
    publicEmbedEnabled: (orgSettings?.enablePublicEmbed ?? true) && !(kbOverrides?.disablePublicEmbed ?? false),
  };
  assertSurfaceEnabled(input.surface, flags);

  const rawTemperature = assistantConfig?.temperature ?? null;
  const rawMaxTokens = assistantConfig?.maxTokens ?? null;
  const temperature = clampNumber(rawTemperature, orgSettings?.maxTemperature ?? defaults.limits.maxTemperature);
  const maxTokensCap = input.surface === "chat"
    ? orgSettings?.maxChatTokens ?? defaults.limits.chatMaxTokens
    : orgSettings?.maxRealtimeTokens ?? defaults.limits.realtimeMaxTokens;
  const maxTokens = clampNumber(rawMaxTokens ?? maxTokensCap, maxTokensCap);

  if (input.surface === "chat" && !chatModel) {
    throw new AIConfigResolutionError("No chat model is configured for this tenant. Set the organisation/KB model or the corresponding server environment value.");
  }
  if (input.surface === "rag-embedding" && !embeddingModel) {
    throw new AIConfigResolutionError("No embedding model is configured for this tenant. Set the organisation/KB model or the corresponding server environment value.");
  }
  if ((input.surface === "realtime" || input.surface === "embed") && !realtimeModel) {
    throw new AIConfigResolutionError("No realtime model is configured for this tenant. Set the organisation/KB model or the corresponding server environment value.");
  }

  const resolved: ResolvedAIConfig = {
    orgId,
    kbId: input.kbId ?? null,
    provider,
    chatModel,
    embeddingModel,
    realtimeModel,
    transcriptionModel: transcriptionCandidate ?? null,
    voiceId,
    temperature,
    maxTokens,
    assistantConfig,
    flags,
    sources: {
      provider: providerSource,
      chatModel: kbOverrides?.chatModel != null ? "kb_override" : orgSettings?.defaultChatModel != null ? "org" : "env",
      embeddingModel: kbOverrides?.embeddingModel != null ? "kb_override" : orgSettings?.defaultEmbeddingModel != null ? "org" : "env",
      realtimeModel: kbOverrides?.realtimeModel != null ? "kb_override" : orgSettings?.defaultRealtimeModel != null ? "org" : "env",
      transcriptionModel: kbOverrides?.transcriptionModel != null ? "kb_override" : orgSettings?.defaultTranscriptionModel != null ? "org" : "env",
      voiceId: assistantConfig?.voiceId != null ? "assistant_config" : "env",
      temperature: assistantConfig?.temperature != null ? "assistant_config" : orgSettings?.maxTemperature != null ? "org" : defaults.limits.maxTemperature != null ? "env" : null,
      maxTokens: assistantConfig?.maxTokens != null ? "assistant_config" : orgSettings?.maxRealtimeTokens != null || orgSettings?.maxChatTokens != null ? "org" : defaults.limits.realtimeMaxTokens != null || defaults.limits.chatMaxTokens != null ? "env" : null,
    },
  };

  console.info("[ai-config] resolved", {
    surface: input.surface,
    orgId,
    kbId: input.kbId ?? null,
    provider: resolved.provider,
    providerSource: resolved.sources.provider,
    chatModel: resolved.chatModel,
    embeddingModel: resolved.embeddingModel,
    realtimeModel: resolved.realtimeModel,
    transcriptionModel: resolved.transcriptionModel,
    voiceId: resolved.voiceId,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    sources: resolved.sources,
    flags: resolved.flags,
    apiKeyConfigured: Boolean(process.env[resolved.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"]?.trim()),
  });

  return resolved;
}

export function getProviderApiKey(provider: AIProvider): string | undefined {
  const envKey = provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
  const value = process.env[envKey]?.trim();
  return value || undefined;
}

export function toProviderConfig(resolved: ResolvedAIConfig): ProviderConfig {
  const embeddingDimension = Number(process.env[`${resolved.provider.toUpperCase()}_EMBEDDING_DIMENSION`]);
  return {
    provider: resolved.provider,
    apiKey: getProviderApiKey(resolved.provider),
    chatModel: resolved.chatModel ?? undefined,
    embeddingModel: resolved.embeddingModel ?? undefined,
    embeddingDimension: Number.isFinite(embeddingDimension) && embeddingDimension > 0 ? embeddingDimension : undefined,
  };
}
